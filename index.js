'use strict';

const express = require('express');
const AWS = require('aws-sdk');
const bodyParser = require('body-parser');
const OpenTok = require('opentok');
const Longpoll = require('express-longpoll');

const app = express();
const longpoll = Longpoll(app);
const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
const s3AccessSecret = process.env.S3_ACCESS_SECRET;
const s3 = new AWS.S3({
  accessKeyId: s3AccessKeyId,
  secretAccessKey: s3AccessSecret,
  signatureVersion: 'v4',
});
const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;
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

function stopArchive(archiveId) {
  opentok.stopArchive(archiveId, (err, archive) => {
    if (err) {
      return console.error(`Could not stop archive ${archiveId}. error=${err.message}`);
    }
    return archive;
  });
}

function buildTemporaryLink(archiveId) {
  const fullPath = `${apiKey}/${archiveId}/archive.mp4`;
  const params = {
    Bucket: 'io.mati.media-storage-dev',
    Key: fullPath,
    Expires: 60 * 10,
    ResponseContentType: 'video/mp4',
  };
  return s3.getSignedUrl('getObject', params);
}

app.get('/', (req, res) => {
  opentok.createSession({ mediaMode: 'routed' }, (err, session) => {
    if (err) throw err;
    app.set('layout', 'horizontalPresentation');
    const token = opentok.generateToken(session.sessionId, {
      role: 'moderator',
      initialLayoutClassList: ['focus'],
    });

    res.render('index.ejs', {
      apiKey,
      sessionId: session.sessionId,
      token,
      focusStreamId: app.get('focusStreamId') || '',
      layout: app.get('layout'),
      getVideoBaseUrl,
    });
  });
});

app.get('/init', (req, res) => {
  opentok.createSession({ mediaMode: 'routed' }, (err, session) => {
    if (err) throw err;
    app.set('layout', 'horizontalPresentation');
    const token = opentok.generateToken(session.sessionId, {
      role: 'moderator',
      initialLayoutClassList: ['focus'],
    });

    res.json({
      apiKey,
      sessionId: session.sessionId,
      token,
      focusStreamId: app.get('focusStreamId') || '',
      layout: app.get('layout'),
      getVideoBaseUrl,
    });
  });
});

app.post('/video', (req, res) => {
  const { body = {} } = req;
  if (body.status === 'uploaded' || body.status === 'available') {
    const { id: archiveId } = body;
    const videoUrl = process.env.IS_S3_ENABLED === 'true'
      ? buildTemporaryLink(archiveId)
      : body.url;
    longpoll.publish(`/video/${archiveId}`, { videoUrl });
  }
  res.end();
});

app.post('/start', (req, res) => {
  const hasAudio = (req.param('hasAudio') !== undefined);
  const hasVideo = (req.param('hasVideo') !== undefined);
  const sessionId = req.param('sessionId');
  const archiveOptions = {
    name: 'Mati liveness check',
    hasAudio,
    hasVideo,
    outputMode: 'composed',
    layout: { type: 'horizontalPresentation' },
  };

  opentok.startArchive(sessionId, archiveOptions, (err, archive) => {
    if (err) {
      return res.send(
        500,
        `Could not start archive for session ${sessionId}. error=${err.message}`,
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

app.listen(process.env.PORT || 3000, () => {
  console.log('You\'re app is now ready at http://localhost:3000/');
});
