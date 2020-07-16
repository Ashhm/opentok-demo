'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const OpenTok = require('opentok');
const Longpoll = require('express-longpoll');

const app = express();
const longpoll = Longpoll(app);

const apiKey = process.env.API_KEY || '46838614';
const apiSecret = process.env.API_SECRET || '53f3c5ebf4fe24a30e54b2b82578b08118cb7208';
const getVideoBaseUrl = process.env.NODE_ENV === 'production'
  ? 'https://opentok-demo-service.herokuapp.com'
  : 'http://localhost:3000';

// Verify that the API Key and API Secret are defined
if (!apiKey || !apiSecret) {
  console.log('You must specify API_KEY and API_SECRET environment variables');
  process.exit(1);
}

app.use(express.static(`${__dirname}/public`));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true,
}));

// Initialize OpenTok
const opentok = new OpenTok(apiKey, apiSecret);

function init() {
  app.listen(process.env.PORT || 3000, () => {
    console.log('You\'re app is now ready at http://localhost:3000/');
  });
}

function stopArchive(archiveId) {
  opentok.stopArchive(archiveId, (err, archive) => {
    if (err) {
      return console.error(`Could not stop archive ${archiveId}. error=${err.message}`);
    }
    return archive;
  });
}

// Create a session and store it in the express app
opentok.createSession({ mediaMode: 'routed' }, (err, session) => {
  if (err) throw err;
  app.set('sessionId', session.sessionId);
  app.set('layout', 'horizontalPresentation');
  // We will wait on starting the app until this is done
  init();
});

app.get('/', (req, res) => {
  const sessionId = app.get('sessionId');
  // generate a fresh token for this client
  const token = opentok.generateToken(sessionId, {
    role: 'moderator',
    initialLayoutClassList: ['focus'],
  });

  res.render('index.ejs', {
    apiKey,
    sessionId,
    token,
    focusStreamId: app.get('focusStreamId') || '',
    layout: app.get('layout'),
    getVideoBaseUrl,
  });
});

app.post('/video', (req, res) => {
  const { body = {} } = req;
  if (body.status === 'available') {
    const { id: archiveId, url: videoUrl } = body;
    longpoll.publish(`/video/${archiveId}`, { videoUrl });
  }
  res.end();
});

app.post('/start', (req, res) => {
  const hasAudio = (req.param('hasAudio') !== undefined);
  const hasVideo = (req.param('hasVideo') !== undefined);
  const archiveOptions = {
    name: 'Mati liveness check',
    hasAudio,
    hasVideo,
    outputMode: 'composed',
    layout: { type: 'horizontalPresentation' },
  };

  opentok.startArchive(app.get('sessionId'), archiveOptions, (err, archive) => {
    if (err) {
      return res.send(
        500,
        `Could not start archive for session ${app.get('sessionId')}. error=${err.message}`,
      );
    }
    setTimeout(() => {
      stopArchive(archive.id);
    }, 7000);
    longpoll.create(`/video/${archive.id}`);
    return res.json(archive);
  });
});

app.get('/stop/:archiveId', (req, res) => {
  const archiveId = req.param('archiveId');
  const archive = stopArchive(archiveId);
  return res.json(archive);
});
