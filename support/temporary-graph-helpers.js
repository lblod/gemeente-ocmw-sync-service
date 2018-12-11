/**
 * This file contains helpers for using and maintaining a temporary
 * graph.
 */

import { updateSudo as update } from './auth-sudo';

/**
 * Saves the supplied RDFa graph in the triplestore.
 *
 * This may be a desired step in processing the contents which ought
 * to be saved in the final triplestore.  The contents can initially
 * be writen to this temporary store.  From here, more complex queries
 * can be executed to ensure only correct data is inserted into the
 * shared graph.
 *
 * @method saveGraphInTriplestore
 *
 * @param {RdfaGraph} graph Graph which contains the triples
 * @param {string} graphUri URI in which the contents should be saved
 *
 * @return {Promise} Returns truethy when the store could be populated.
 */
async function saveGraphInTriplestore( graph, graphUri ) {
  await update(`INSERT DATA { GRAPH <${graphUri}> { ${graph.toString()} } }`);
}

/**
 * Removes all content from a temporary graph
 *
 * @method cleanTempGraph
 *
 * @param {string} tempGraph Temporary graph which should be cleared.
 *
 * @return {Promise} Promise which emits successfully if the graph was
 * correctly cleaned.
 */
async function cleanTempGraph( tempGraph ) {
  await update( `DELETE WHERE { GRAPH <${tempGraph}> {?s ?p ?o.} }` );
}


export { saveGraphInTriplestore, cleanTempGraph };
