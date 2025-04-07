require('dotenv').config();
const express = require('express');
const SFTPClient = require('ssh2-sftp-client');
const cors = require('cors');
const app = express();
const port = 3000;

const sftpConfig = {
  host: process.env.host,
  port: parseInt(process.env.port),
  username: process.env.username,
  password:process.env.password,
}

app.use(cors());
app.use(express.json()); // to parse JSON body

// Route to receive messages from B
app.get('/receive', async (req, res) => {
  const sftp = new SFTPClient();
  const remoteFilePath1 = `${process.env.remoteFilePath1}`;
  const remoteFilePath2 = `${process.env.remoteFilePath2}`;

  try {
    await sftp.connect(sftpConfig);

    const [data1, data2] = await Promise.all([
      sftp.get(remoteFilePath1),
      sftp.get(remoteFilePath2)
    ]);

    const raw1 = data1.toString();
    const raw2 = data2.toString();
    const combinedRaw = raw1 + raw2;

    // Match all JSON objects using regex
    const jsonObjects = [...combinedRaw.matchAll(/{.*?}/g)].map(match => {
      try {
        return JSON.parse(match[0]);
      } catch (err) {
        console.error('Parse error on:', match[0]);
        return null;
      }
    }).filter(obj => obj !== null); // remove any that failed parsing

    res.json(jsonObjects);
  } catch (err) {
    console.error('Receive error:', err.message);
    res.status(500).send('Error reading or parsing messages');
  } finally {
    sftp.end();
  }
});


app.post('/login', async (req, res) => {
  const {username, password, displayName} = req.body;
  try {
    await sftp.connect({
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: username,
      password: password,
    });
    const response = {
      status: true, message: "Valid Credentials"
    }
    res.json(response);
  } catch (err) {
    const response = {
      status: false, message: "Invalid Credentials", err: err
    }
    res.json(response);
  }

});




// Route to send message to B
app.post('/send', async (req, res) => {
  const { sender, message, username, password } = req.body;
  const sendFilePath = `/home/${username}/uploads/AtoB.txt`;
  if (!sender || !message) {
    return res.status(400).json({ success: false, error: 'Missing sender or message' });
  }

  const sftp = new SFTPClient();
  const timestamp = new Date().toISOString();
  // const formattedMessage = `[${timestamp}] ${sender}: ${message}\n`;
  const formattedMessage = {
    timestamp: timestamp,
    sender: sender,
    message: message
  };

  try {
    await sftp.connect({
      host: sftpConfig.host,
      port: sftpConfig.port,
      username: username,
      password:password,
    });

    // 🔁 Try reading the current file
    let currentContent = '';
    try {
      const data = await sftp.get(sendFilePath);
      currentContent = data.toString();
    } catch (err) {
      // ✅ File might not exist yet (code 2 = 'no such file')
      if (err.code === 2) {
        currentContent = ''; // Initialize as empty
      } else {
        throw err; // Other errors are real
      }
    }

    // ✅ Final message string to write
    const finalContent = currentContent + JSON.stringify(formattedMessage);
    await sftp.put(Buffer.from(finalContent), sendFilePath);

    res.json({ success: true, message: 'Message sent' });
  } catch (err) {
    console.error('SFTP error:', err);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    sftp.end();
  }
});

app.get('/',(req, res)=>{
  res.send("Hello");
})


app.listen(port, () => {
  try{
    console.log(`Server running at http://localhost:${port}`);
  }
  catch(err){
    console.log(err);
  }
});
