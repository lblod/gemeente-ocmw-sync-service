import { saveGraphInTriplestore, cleanTempGraph } from './temporary-graph-helpers';
import { findFirstNodeOfType, findAllNodesOfType } from './dom-helpers';
import { graphForDomNode, removeBlankNodes } from './rdfa-helpers';
import { sparqlEscapeString, sparqlEscapeUri, sparqlEscapeDateTime, uuid } from 'mu';
import { querySudo as query, updateSudo as update } from './auth-sudo';
import fs from 'fs-extra';

/**
 * validate the body
 *
 **/
function hasValidBody(body) {
  if (!body.data) return false;
  const data = body.data;
  if (data.type !== "sync") return false;
  if (!body.data.relationships) return false;
  if (!body.data.relationships.document) return false;
  return true;
}


/**
 * convert results of select query to an array of objects.
 * @method parseResult
 * @return {Array}
 */
const parseResult = function(result) {
  const bindingKeys = result.head.vars;
  return result.results.bindings.map((row) => {
    const obj = {};
    bindingKeys.forEach((key) => obj[key] = row[key].value);
    return obj;
  });
};


/**
 * fetch the current user and group linked to the SessionIRI
 *
 * @method fetchSession
 * @return {Object}
 */
async function fetchSession(sessionURI) {
  const result = await query(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session/>
       PREFIX foaf: <http://xmlns.com/foaf/0.1/>
       PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       SELECT ?user ?group ?userID ?groupID
       WHERE {
         ${sparqlEscapeUri(sessionURI)} (session:account / ^foaf:account) ?user;
                                        ext:sessionGroup  ?group.
         ?group mu:uuid ?groupID.
         ?user mu:uuid ?userID.
       }`);
  if (result.results.bindings.length === 0) {
    return null;
  }
  else {
    return parseResult(result)[0];
  }
};

/**
 * fetch the ocmw related to this session, assumes (and validates) the current session is linked to a gemeentebedrijf
 */
async function fetchRelatedOcwm(session) {
  const r = await query(`
       PREFIX session: <http://mu.semte.ch/vocabularies/session>
       PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
       PREFIX ext: <http://mu.semte.ch/vocabularies/ext/>
       PREFIX besluit: <http://data.vlaanderen.be/ns/besluit#>
       PREFIX mandaat: <http://data.vlaanderen.be/ns/mandaat#>
       PREFIX org: <http://www.w3.org/ns/org#>
       SELECT ?ocmwUUID
       WHERE {
             ${sparqlEscapeUri(session.group)} a besluit:Bestuurseenheid ;
                   besluit:werkingsgebied ?gebied ;
                   besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000001> .
             ?ocmw a besluit:Bestuurseenheid;
                   besluit:werkingsgebied ?gebied;
                   besluit:classificatie <http://data.vlaanderen.be/id/concept/BestuurseenheidClassificatieCode/5ab0e9b8a3b2ca7c5e000002>;
                   mu:uuid ?ocmwUUID.
       }
  `);
  const parsedResult = parseResult(r);
  return parsedResult.length > 0 ? parsedResult[0]["ocmwUUID"] : null;
};

/**
 * copies all rdf extracted from the document to a temporary graph
 */
async function setupTempGraphFromDoc(document) {
  const node = document.getTopDomNode();
  const dom = document.getDom();

  // Store session in temporary graph
  const sessionNode = findFirstNodeOfType( node, "http://data.vlaanderen.be/ns/besluit#Zitting" );
  const tmpGraphName = `http://notule-importer.mu/${uuid()}`;
  const tmpGraph = graphForDomNode( sessionNode, dom, "https://besluit.edu" );
  removeBlankNodes( tmpGraph );

  // Find outerHTML of session
  const outerHtml = sessionNode.outerHTML;

  // Store session in temporary graph (in Virtuoso)
  await saveGraphInTriplestore( tmpGraph, tmpGraphName );
  return tmpGraphName;
}

/**
 * gets queries (with extesion .rq) from filesystems
 */
async function getQueries() {
  const queryPath = '/app/queries';
  const items = await fs.readdir(queryPath);
  const queries = [];
  for (const item of items)  {
    if (/.*\.rq$/.test(item)) {
      const query = await fs.readFile(`${queryPath}/${item}`, 'utf8');
      queries.push(query.toString());
    }
  }
  return queries;
}


/**
 * executes the queries, these should copy from $tmpGraph to $syncGraph
 * variables will be replaced with actual graphs before execution
 */
async function syncDocument(syncGraph, document) {
  await update(`DROP SILENT GRAPH ${sparqlEscapeUri(syncGraph)};`);
  const tmpGraph = await setupTempGraphFromDoc(document);
  const queries = await getQueries();
  for (const query of queries) {
    const executableQuery = query.replace(/\$tmpGraph/g,tmpGraph).replace(/\$syncGraph/g,syncGraph);
    if (executableQuery.includes(tmpGraph) && executableQuery.includes(syncGraph) )
      await update(executableQuery);
    else {
      console.warn(`query is missing either $tmpGraph or $syncGraph`, executableQuery);
    }
  }
  await update(`DROP SILENT GRAPH ${sparqlEscapeUri(tmpGraph)}`);
  const syncID = uuid();
  await update(`
       PREFIX mu:   <http://mu.semte.ch/vocabularies/core/>
       PREFIX dcterms: <http://purl.org/dc/terms/>
       PREFIX void: <http://rdfs.org/ns/void#>
       INSERT DATA {
          GRAPH ${sparqlEscapeUri(syncGraph)} {
             ${sparqlEscapeUri(syncGraph)} a void:Dataset;
                                           mu:uuid ${sparqlEscapeString(syncID)};
                                           dcterms:created ${sparqlEscapeDateTime(new Date())};
                                           dcterms:source ${sparqlEscapeUri(document.uri)}.
          }
       }`);
  return {
    data: {
      type: "sync",
      id: syncID,
      attributes: {
        uri: syncGraph
      },
      relationships: {
        document: {
          id: document.id
        }
      },
      links: {
        self: `/sync/${syncID}`
      }
    }
  };
};
export { hasValidBody, syncDocument, fetchSession, fetchRelatedOcwm };
