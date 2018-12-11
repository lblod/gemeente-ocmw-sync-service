import { app, uuid } from 'mu';
import { editorDocumentFromUuid } from './support/editor-document';
import { hasValidBody, syncDocument, fetchRelatedOcwm, fetchSession } from './support/base';

app.post('/sync/', async function(req, res) {
  try {
    const sessionURI = req.headers['mu-session-id'];
    const activeSession = await fetchSession(sessionURI);
    if (activeSession) {
      const body = req.body;
      if (hasValidBody(body)) {
        const doc = await editorDocumentFromUuid( body.data.relationships.document.data.id );
        const ocmwID = await fetchRelatedOcwm(activeSession);
        if (!ocmwID) {
          res.status(400).send({status:400, title: 'invalid document, has no related ocwm'});
        }
        else {
          const ocmwGraph = `http://mu.semte.ch/graphs/temporary-sync-${ocmwID}`;
          const sync = await syncDocument(ocmwGraph, doc);
          res.status(201).send(sync);
        }
      }
      else {
        res.status(400).send({status:400, title: 'invalid body'});
      }
    }
    else {
      console.warn(`invalid session ${activeSession}`);
      res.status(401).send({status: 401, title: 'could not find an account linked to this session'});
    }
  } catch (err) {
    console.error(err);
    res
      .status(500)
      .send( { message: `An error occurred while syncing data from document ${req.params.documentIdentifier}`,
               err: JSON.stringify(err) } );
  }
} );
