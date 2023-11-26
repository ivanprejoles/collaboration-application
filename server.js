const express = require('express');
const app = express();
const server = require('http').Server(app);
const io = require('socket.io')(server, {
  compression: true,
  maxHttpBufferSize: 1e7,
  pingInterval: 10000,
  pingTimeout: 5000
});
const pool = require('./src/connection/connection.js');


app.set('views', './views');
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get('/', (req, res) => {
    res.render('login')
})
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error: true, message: 'Login failed.'})
    }
    connection.query('SELECT userid,username FROM usertab where username = ? AND password = ?', [username, password], (err, result) => {
      connection.release();
      if(err || result.length <= 0){
        res.json({error: true, message: 'Login failed'})
      }else{
        res.render('inside', {data: result[0]})
      }
    })
  })
});
app.post('/provide-my-room', (req, res) => {
  const userID = req.body.userID;
  pool.getConnection((error, connection) => {
    if(err){
      return res.json({error: true, message: 'Server error'})
    }
    connection.query('SELECT DISTINCT rt.roomname, mt.* FROM userroom ur JOIN roomtab rt ON ur.roomID = rt.roomID JOIN messagetab mt ON ur.roomID = mt.roomID WHERE ur.userID = ?', [userID], (err, result) => {
      connection.release();
      if(error){
        res.json({error:true, message:'no room'});
      }else{
        res.json({error:false, data: result})
      }
    })
  })
})
app.post('/get-rooms', (req, res) => {
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error: true, message: 'getting rooms failed'})
    }
    connection.query('SELECT room.roomID, room.roomName FROM userroom uR INNER JOIN roomtab room ON uR.roomID = room.roomID WHERE uR.userID = ?', [req.body.user], (error, result) => {
      connection.release()
      if(error){
        return res.json({error: true, message: 'selecting error'})
      }
      res.json({error:false, rooms: result})
    })
  })
})
app.post('/join-room', (req, res) => {
  const userID = req.body.user;
  const roomID = req.body.room;  
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error:true, message: 'database error'})
    }
    const conditionQuery = (req.body.existing) ? 'SELECT roomID from userroom where userID = ? AND roomID = ?' : 'INSERT INTO userroom (userID, roomID) VALUES (?, ?)';
    connection.query(conditionQuery, [userID, roomID], (error, result) => {
      if(error || result.length <= 0){
        connection.release();
        return res.json({error:true, message:'error joining room'})
      }
      const dataSizeQuery = 'SELECT dataSize FROM messagetab where roomID = ? order by mhid desc limit 10'
      connection.query(dataSizeQuery, [roomID], (dataError, dataSizeResults) => {
        if(dataError){
          connection.release();
          return res.json({ error: true, message: 'error retrieving dataSize' });
        }
        let rowCount = 0;
        let totalDataSize = 0;
        const threshold = 800;
        for (const dataSizeRow of dataSizeResults) {
          const dataSize = dataSizeRow.dataSize;
          rowCount++;
          totalDataSize += dataSize;
          if (totalDataSize + dataSize <= threshold) {

          } else {
            break;
          }
        }
        connection.query('SELECT mhID, daytime, message1, message2, message3, message4 FROM messagetab where roomID = ? ORDER BY mhid DESC LIMIT ?', [roomID, rowCount], (error2, result2) => {
          connection.release();
          if(error2){
            return res.json({error:true, message:'error selecting room'})
          }
          res.json({error:false, data: result2})
        })
      })
    })
  })
})
app.post('/pagination', (req, res) => {
  const mhID = req.body.messageOffset;
  const roomID = req.body.room;
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error:true, message: 'database error'})
    }
    const dataSizeQuery = 'SELECT dataSize FROM messagetab where roomID = ? AND mhid < ? order by mhid desc limit 10'
    connection.query(dataSizeQuery, [roomID, mhID], (dataError, dataSizeResults) => {
      if(dataError){
        connection.release();
        return res.json({ error: true, message: 'error retrieving dataSize' });
      }
      let rowCount = 0;
      let totalDataSize = 0;
      const threshold = 800;
      for (const dataSizeRow of dataSizeResults) {
        const dataSize = dataSizeRow.dataSize;
        rowCount++;
        totalDataSize += dataSize;
        if (totalDataSize + dataSize <= threshold) {
        } else {
          break;
        }
      }
      connection.query('SELECT mhID, daytime, message1, message2, message3, message4 FROM messagetab where roomID = ? AND mhid < ? ORDER BY mhid DESC LIMIT ?', [roomID, mhID, rowCount], (error2, result2) => {
        connection.release();
        if(error2){
          return res.json({error:true, message:'error selecting room'})
        }
        res.json({error:false, rooms: result2})
      })
    })
  })
})
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  pool.getConnection((err, connection) => {
    if(err){
      return res.json({error: true, message: 'Registration failed.'})
    }
    connection.query('INSERT INTO usertab (username, password) values (?,?)', [username,password,username], (err, result) => {
      connection.release();
      if(err){
        res.json({error:true, message: 'registration failed 2'})
      }else{
        res.json({error:false, message: 'Registered successfully'})
      }
    })
  })
});
app.post('/create-room', (req, res) => {
    pool.getConnection((err, connection) => {
      if(err){
        return res.json({error:true, message: 'Connection error'});
      }
      connection.query('INSERT INTO roomtab(roomName) VALUES (?)', [req.body.room], (error,result) => {
        connection.release();
        if(error || result.length <= 0){
          res.json({error:true, message:'roomtab error'})
        }else{
          res.json({error: false, message: 'Room successfully created'})
          messageNamespace.emit('room-created', req.body.room, result.insertId);
        }
      })
    })
});
server.listen(3000, () => {
    console.log('listening to port 3000'); 
})

const messageNamespace = io.of("/notification");

messageNamespace.on('connection', socket => {
  messageNamespace.emit('nice','nice')
  socket.on('new-user', (room, username) => {
    socket.join(room)
    socket.to(room).emit('user-connected', username);
  })
  socket.on('streamChunk', (chunk, room) => {
    messageNamespace.to(room).emit('serverChunk', chunk);
  }); 
  socket.on('streamEnd', (chunk, room) => {
    messageNamespace.to(room).emit('serverEnd', chunk);
  })
  socket.on('file-update', (room, fileID, data) => {
    socket.to(room).emit('update-file', fileID, data);
  })
  socket.on('send-chat-message', (room, userID, name, message, date, timeColumn, newRow) => {
    socket.to(room).emit('chat-message', { message: message, name: name }, () => {
      pool.getConnection((err, connection) => {
        if(err){  
          console.log(err)
          return
        }
        if(newRow){
          connection.query('INSERT INTO messagetab(roomID, daytime, message1, message2, message3, message4) VALUES (?, ?, JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY(), JSON_ARRAY())', [room, date], (error, result) => {
            if(error){
              if(error.code === 'ER_DUP_ENTRY'){
                console.log('message created');
              }else{
                console.log(error);
                connection.release();
                return
              }
            }
          })
        }
        const newMessageData = JSON.stringify({userID:userID, message: message, userName: name})
        const dataSize = Buffer.byteLength(newMessageData);
        connection.query(`update messagetab set datasize = datasize + ?,${timeColumn} = JSON_ARRAY_APPEND(${timeColumn}, '$', ?) where roomID = ?`, [dataSize, newMessageData, room], (error2, result) => {
          connection.release();
          if(error2){
            console.log(error2)
            return
          }
          console.log('done')
        })
      })
    })
  })
  socket.on('disconnect', () => {
    messageNamespace.emit('disconnected','disconnected')
  })
})



