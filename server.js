const express = require('express'); // Import thư viện express để tạo ứng dụng web
const app = express();   // Khởi tạo một ứng dụng express
const http = require('http').createServer(app); // Tạo một HTTP server từ ứng dụng express
const io = require('socket.io')(http);  // Khởi tạo Socket.IO server và liên kết với HTTP server
const path = require('path');  // Import thư viện path để làm việc với đường dẫn tệp và thư mục

//Cấu hình
const PORT = process.env.PORT || 8000;

// Phục vụ file tĩnh trong public
app.use(express.static(path.join(__dirname, 'public')));

// Khi truy cập "/", trả về index.html 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

//  Quản lý phòng 
let rooms = {}; // { roomId: { players: [{id, username}], boardNumbers: {}, gameActive: false } }
let chatMessages = []; // Mảng lưu trữ tin nhắn chat
let connectedUsers = 0; // Đếm số người dùng đang kết nối

//  Quản lý tung đồng xu 
let coinToss = {
    roomId: null, // ID của phòng đang thực hiện tung đồng xu
    player1: null, // Socket ID của người chơi thứ 1
    player2: null, // Socket ID của người chơi thứ 2
    player1Choice: null, // Lựa chọn mặt đồng xu của người chơi thứ 1
    player2Choice: null, // Lựa chọn mặt đồng xu của người chơi thứ 2
    result: null, // Kết quả của lần tung đồng xu 
    ready: false, // Thông báo cả hai người chơi đã chọn mặt đồng xu chưa
    firstChooser: null //Socket ID của người chơi chọn mặt đồng xu đầu tiên trong ván hiện tại
};

// Hàm reset trạng thái của coinToss trong phòng
function resetCoinToss(roomId) {
    coinToss = {
        roomId: roomId,
        player1: null,
        player2: null,
        player1Choice: null,
        player2Choice: null,
        result: null,
        ready: false,
        firstChooser: null // Reset cả biến này khi reset coinToss
    };
}

// Quản lý phòng update 
// Hàm này trả về thông tin của các phòng đang có người chơi
function getRoomsInfo() {
    const roomsInfo = {};
    for (const [roomId, room] of Object.entries(rooms)) {  // Duyệt qua từng phòng trong 'rooms'
        if (room.players.length > 0) { // Chỉ lấy phòng có 1 người chơi
            roomsInfo[roomId] = {
                players: room.players,
                gameActive: room.gameActive
            };
        }
    }
    return roomsInfo;
}

//  Xử lý socket.io 
io.on('connection', (socket) => {
    console.log('🔵 Người dùng mới kết nối:', socket.id);
    connectedUsers++; //Biến đếm số người vào socket.io

    // Nếu đây là người dùng đầu tiên, khởi tạo lại lịch sử chat
    if (connectedUsers === 1) {
        chatMessages = [];
        console.log('✨ Khởi tạo lịch sử chat mới');
    }

    // Gửi lịch sử chat (nếu có) cho người dùng mới
    socket.emit('allChatMessages', chatMessages);

    // Update all clients with current rooms
    socket.on('requestRooms', () => {
        socket.emit('updateRooms', getRoomsInfo());
    });

    // Xử lý chat
    socket.on('sendMessage', (data) => {
        const { message, sender } = data;
        const newMessage = { sender, message };

        chatMessages.push(newMessage); // Thêm tin nhắn mới vào mảng 

        // Giới hạn số lượng tin nhắn được lưu trữ 
        if (chatMessages.length > 100) {
            chatMessages.shift(); // Xóa tin nhắn đầu tiên
        }

        io.emit('chatMessage', newMessage); // Gửi tin nhắn mới cho tất cả

        console.log(`✉️ Message from ${sender}: ${message}`); // In ra console nội dung tin nhắn và người gửi
    });

    // Tạo phòng
    socket.on('createRoom', (username) => {
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase(); // Tạo một ID phòng ngẫu nhiên
        rooms[roomId] = {
            players: [{ id: socket.id, username }],
            boardNumbers: {},
            gameActive: false
        };
        socket.join(roomId);
        socket.roomId = roomId; // Lưu roomId vào socket để dễ truy cập
        socket.emit('roomCreated', { roomId, username });
        socket.emit('waitingForOpponent', roomId);

        // Broadcast system message
        io.emit('chatMessage', {
            sender: 'Hệ thống',
            message: `${username} đã tạo phòng ${roomId}`,
            type: 'system'
        });

        // Update rooms list for all clients
        io.emit('updateRooms', getRoomsInfo());

        console.log(`✅ Room ${roomId} created by ${username} (${socket.id})`);
    });

    // Tham gia phòng
    socket.on('joinRoom', (data) => {
        const { roomId, username } = data;

        // Kiểm tra phòng tồn tại và còn chỗ
        if (rooms[roomId]) {
            if (rooms[roomId].players.length < 2) {
                // Lấy thông tin người chơi đầu tiên
                const firstPlayer = rooms[roomId].players[0];

                // Thêm người chơi mới vào phòng
                rooms[roomId].players.push({ id: socket.id, username });
                socket.join(roomId);
                socket.roomId = roomId;

                // Thông báo cho người chơi đã tham gia phòng thành công
                socket.emit('joinedRoom', {
                    roomId,
                    opponent: firstPlayer
                });

                // Thông báo cho người chơi đầu tiên biết có người tham gia
                io.to(firstPlayer.id).emit('playerJoined', {
                    player: { id: socket.id, username }
                });

                // Broadcast system message
                io.emit('chatMessage', {
                    sender: 'Hệ thống',
                    message: `${username} đã tham gia phòng ${roomId}`,
                    type: 'system'
                });

                // Nếu có đủ 2 người chơi, bắt đầu tung đồng xu
                if (rooms[roomId].players.length === 2) {
                    resetCoinToss(roomId);
                    coinToss.roomId = roomId;
                    coinToss.player1 = rooms[roomId].players[0].id;
                    coinToss.player2 = rooms[roomId].players[1].id;
                    io.to(roomId).emit('startCoinToss'); // Báo cho client bắt đầu tung xu
                } else {
                    socket.emit('waitingForOpponent', roomId);
                }

                checkGameStart(roomId); // Check if game can start
                // Update rooms list for all clients
                io.emit('updateRooms', getRoomsInfo());

                console.log(`👤 Player ${username} (${socket.id}) joined room ${roomId}`);
            } else {
                // Chỉ gửi thông báo lỗi nếu phòng đã đủ (>= 2) người
                if (rooms[roomId].players.length >= 2) {
                    socket.emit('errorMessage', 'Phòng đã đủ người.');
                }
            }
        } else {
            socket.emit('errorMessage', 'Phòng không tồn tại.');
        }
    });

    // Xử lý chọn mặt đồng xu
    socket.on('chooseCoinSide', (data) => {
        const { roomId, choice } = data;
        if (coinToss.roomId === roomId) {
            if (!coinToss.firstChooser) {
                coinToss.firstChooser = socket.id;
                if (socket.id === coinToss.player1) {
                    coinToss.player1Choice = choice;
                } else if (socket.id === coinToss.player2) {
                    coinToss.player2Choice = choice;
                }
            } else {
                if (socket.id !== coinToss.firstChooser) {
                    if (coinToss.player1Choice && choice === coinToss.player1Choice) {
                        // Người chơi 2 chọn trùng, tự động đổi và thông báo
                        const forcedChoice = choice === 'hình' ? 'chữ' : 'hình';
                        if (socket.id === coinToss.player1) {
                            coinToss.player1Choice = forcedChoice;
                        } else if (socket.id === coinToss.player2) {
                            coinToss.player2Choice = forcedChoice;
                        }
                        io.to(roomId).emit('forceCoinSide', forcedChoice); // Thông báo cho client
                    } else if (coinToss.player2Choice && choice === coinToss.player2Choice) {
                        // Người chơi 2 chọn trùng, tự động đổi và thông báo
                        const forcedChoice = choice === 'hình' ? 'chữ' : 'hình';
                        if (socket.id === coinToss.player1) {
                            coinToss.player1Choice = forcedChoice;
                        } else if (socket.id === coinToss.player2) {
                            coinToss.player2Choice = forcedChoice;
                        }
                        io.to(roomId).emit('forceCoinSide', forcedChoice); // Thông báo cho client
                    } else {
                        if (socket.id === coinToss.player1) {
                            coinToss.player1Choice = choice;
                        } else if (socket.id === coinToss.player2) {
                            coinToss.player2Choice = choice;
                        }
                    }
                } else {
                    // Người chơi đầu tiên chọn lại thì cho phép
                    if (socket.id === coinToss.player1) {
                        coinToss.player1Choice = choice;
                    } else if (socket.id === coinToss.player2) {
                        coinToss.player2Choice = choice;
                    }
                }
            }

            // Kiểm tra xem cả hai người chơi đã chọn chưa
            if (coinToss.player1Choice && coinToss.player2Choice) {
                // Xác định kết quả dựa trên lựa chọn
                coinToss.result = Math.random() < 0.5 ? "chữ" : "hình";
                let firstPlayerId = (coinToss.player1Choice === coinToss.result) ? coinToss.player1 : coinToss.player2;

                io.to(roomId).emit('coinTossResult', {
                    result: coinToss.result,
                    firstPlayerId: firstPlayerId,
                    player1Choice: coinToss.player1Choice, // Gửi lựa chọn của người chơi 1
                    player2Choice: coinToss.player2Choice  // Gửi lựa chọn của người chơi 2
                });

                resetCoinToss(roomId);
            }
        }
    });

    // Nhận bảng số từ người chơi
    socket.on('boardNumbers', (data) => {
        const { roomId, numbers, username } = data;
        if (rooms[roomId]) {
            rooms[roomId].boardNumbers[socket.id] = numbers;
            console.log(`📋 Received board numbers from ${username} (${socket.id}) in room ${roomId}`);

            // Kiểm tra nếu đủ 2 người chơi và đủ bảng số thì bắt đầu game
            checkGameStart(roomId);
        }
    });

    // Đánh dấu số
    socket.on('markNumber', (data) => {
        const { roomId, number } = data;
        if (rooms[roomId] && rooms[roomId].gameActive) {
            // Gửi thông báo đến tất cả người chơi trong phòng về số được đánh dấu
            io.to(roomId).emit('numberMarked', {
                number,
                markerId: socket.id
            });

            console.log(`🎯 Player ${socket.id} marked number ${number} in room ${roomId}`);
        }
    });

    // Xử lý khi có người thắng
    socket.on('gameWon', (roomId) => {
        if (roomId && rooms[roomId]) {
            rooms[roomId].gameActive = false;
            io.to(roomId).emit('gameWon', {
                winner: socket.id
            });
            console.log(`🏆 Player ${socket.id} won in room ${roomId}`);
        }
    });

    // Xử lý chơi lại
    socket.on('playAgain', (roomId) => {
        if (roomId && rooms[roomId]) {
            // Reset thông tin game
            rooms[roomId].boardNumbers = {};
            rooms[roomId].gameActive = false;

            // Bắt đầu lại quá trình tung đồng xu
            resetCoinToss(roomId);
            coinToss.roomId = roomId;
            coinToss.player1 = rooms[roomId].players[0].id;
            coinToss.player2 = rooms[roomId].players[1].id;
            io.to(roomId).emit('startCoinToss'); // Báo cho client bắt đầu tung xu

            // Thông báo cho tất cả người chơi trong phòng
            io.to(roomId).emit('gameRestart');
            console.log(`🔄 Game restarted in room ${roomId}`);
        }
    });

    // Xử lý rời phòng
    socket.on('leaveRoom', (roomId) => {
        if (leaveRoom(socket, roomId)) {
            // Update rooms list for all clients
            io.emit('updateRooms', getRoomsInfo());
        }
    });

    // Ngắt kết nối
    socket.on('disconnect', () => {
        console.log('🔴 Người dùng ngắt kết nối:', socket.id);
        connectedUsers--;

        // Không cần xóa chatMessages ở đây. Nó sẽ tự động được giải phóng
        // khi không còn ai kết nối và biến connectedUsers = 0.

        console.log(`👤 Số người dùng còn lại: ${connectedUsers}`);

        // Tìm phòng của người chơi bị ngắt kết nối
        const roomId = socket.roomId;
        if (roomId) {
            if (leaveRoom(socket, roomId)) {
                // Update rooms list for all clients
                io.emit('updateRooms', getRoomsInfo());
            }
        }
    });
});

// Modified leaveRoom function to return whether the room list should be updated
function leaveRoom(socket, roomId) {
    let shouldUpdateRooms = false;

    if (roomId && rooms[roomId]) {
        // Get username before removing
        const player = rooms[roomId].players.find(p => p.id === socket.id);
        const username = player ? player.username : 'Người chơi';

        // Thông báo cho những người còn lại trong phòng
        socket.to(roomId).emit('playerLeft', {
            playerId: socket.id,
            message: `${username} đã rời phòng.`
        });

        // Xóa người chơi khỏi phòng
        if (rooms[roomId].players) {
            rooms[roomId].players = rooms[roomId].players.filter(player => player.id !== socket.id);
        }

        // Xóa bảng số của người chơi
        if (rooms[roomId].boardNumbers && rooms[roomId].boardNumbers[socket.id]) {
            delete rooms[roomId].boardNumbers[socket.id];
        }

        // Broadcast system message
        io.emit('chatMessage', {
            sender: 'Hệ thống',
            message: `${username} đã rời khỏi phòng ${roomId}`,
            type: 'system'
        });

        shouldUpdateRooms = true;

        // Xóa phòng nếu không còn ai
        if (rooms[roomId].players.length === 0) {
            delete rooms[roomId];
            console.log(`❌ Room ${roomId} deleted (no players remaining)`);
        }

        // Rời khỏi phòng Socket.IO
        socket.leave(roomId);
        delete socket.roomId;

        console.log(`👋 Player ${socket.id} left room ${roomId}`);
    }

    return shouldUpdateRooms;
}

// Helper function to check if game should start
function checkGameStart(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // Nếu có 2 người chơi và đủ bảng số
    if (room.players.length === 2 &&
        Object.keys(room.boardNumbers).length === 2) {

        // Bắt đầu game
        room.gameActive = true;

        // Gửi thông tin bắt đầu game cho các người chơi
        io.to(roomId).emit('startGame', {
            roomId,
            players: room.players
        });

        console.log(`🚀 Game started in room ${roomId}`);
        io.emit('updateRooms', getRoomsInfo()); // Update room list
    }
}

// --- Khởi động server ---
http.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});