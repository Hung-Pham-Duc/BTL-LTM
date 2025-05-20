const express = require('express'); 
const app = express();   
const http = require('http').createServer(app); 
const io = require('socket.io')(http); 
const path = require('path');  

//Cấu hình
const PORT = process.env.PORT || 8000;

// Phục vụ file tĩnh trong public
app.use(express.static(path.join(__dirname, 'public')));

// Khi truy cập "/", trả về index.html 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Quản lý phòng
let rooms = {}; // { roomId: { players: [{id, username}], boardNumbers: {}, gameActive: false, maxPlayers: 2, turnOrder: [], currentPlayerIndex: 0, creatorId: null } }
let chatMessages = []; // Mảng lưu trữ tin nhắn chat
let connectedUsers = 0; // Đếm số người dùng đang kết nối

//  Quản lý tung đồng xu 
let coinToss = {
    roomId: null, // ID của phòng đang thực hiện tung đồng xu
    player1: null, 
    player2: null, 
    player1Choice: null, 
    player2Choice: null, 
    result: null, // Kết quả của lần tung đồng xu 
    ready: false, // Thông báo cả hai người chơi đã chọn mặt đồng xu chưa
    firstChooser: null //Socket ID của người chơi chọn mặt đồng xu đầu tiên trong ván hiện tại
};

// Hàm reset trạng thái tung đồng xu
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

// Lấy thông tin các phòng đang có người chơi
function getRoomsInfo() {
    const roomsInfo = {};
    for (const [roomId, room] of Object.entries(rooms)) {
        if (room.players.length > 0) { // Chỉ lấy phòng có người chơi
            roomsInfo[roomId] = {
                players: room.players.map(p => ({ username: p.username })), // Chỉ gửi username
                gameActive: room.gameActive,
                maxPlayers: room.maxPlayers // Thêm maxPlayers
            };
        }
    }
    return roomsInfo;
}

// Xử lý rời phòng
function leaveRoom(socket, roomId) {
    const room = rooms[roomId];
    if (!room) return false;

    const playerLeaving = room.players.find(p => p.id === socket.id);
    const username = playerLeaving ? playerLeaving.username : 'Người chơi';

    // Xóa người chơi khỏi phòng
    room.players = room.players.filter(player => player.id !== socket.id);
    delete room.boardNumbers[socket.id];

    socket.leave(roomId);
    delete socket.roomId;
    console.log(`👋 Player <span class="math-inline">\{username\} \(</span>{socket.id}) left room ${roomId}`);

    io.emit('chatMessage', {
        sender: 'Hệ thống',
        message: `${username} đã rời khỏi phòng ${roomId}`,
        type: 'system'
    });

    if (room.players.length === 0) {
        delete rooms[roomId];
        console.log(`❌ Room ${roomId} deleted (no players remaining)`);
        io.emit('updateRooms', getRoomsInfo());
        return true;
    }

    // Xử lý nếu game đang diễn ra
    if (room.gameActive) {
        // Nếu số người chơi còn lại ít hơn mức tối thiểu (ví dụ < 2), kết thúc game
        if (room.players.length < 2) { // Hoặc < room.minPlayersForGame nếu bạn có logic đó
            room.gameActive = false;
            io.to(roomId).emit('gameEndedByPlayerLeft', { message: `Trò chơi kết thúc do ${username} rời phòng.` });
            // Có thể xóa phòng hoặc cho phép người chơi còn lại thoát
        } else {
            // Cập nhật turnOrder và currentPlayerIndex
            room.turnOrder = room.turnOrder.filter(playerId => playerId !== socket.id);
            if (room.turnOrder.length > 0) {
                // Nếu người rời đi là người đang có lượt, chuyển lượt
                if (room.turnOrder[room.currentPlayerIndex % room.turnOrder.length] === undefined ||
                    !room.players.find(p => p.id === room.turnOrder[room.currentPlayerIndex % room.turnOrder.length])) {
                    room.currentPlayerIndex = room.currentPlayerIndex % room.turnOrder.length;
                    // Đảm bảo currentPlayerIndex hợp lệ
                     if (room.currentPlayerIndex >= room.turnOrder.length) {
                        room.currentPlayerIndex = 0;
                    }
                }
                const nextPlayerId = room.turnOrder[room.currentPlayerIndex];
                const nextPlayer = room.players.find(p => p.id === nextPlayerId);
                io.to(roomId).emit('playerLeftUpdateTurn', {
                    playerId: socket.id,
                    message: `${username} đã rời phòng.`,
                    nextPlayerId: nextPlayerId,
                    nextPlayerUsername: nextPlayer ? nextPlayer.username : '',
                    remainingPlayers: room.players.map(p => ({id: p.id, username: p.username}))
                });
            } else { // Không còn ai trong turnOrder
                 room.gameActive = false;
                 io.to(roomId).emit('gameEndedByPlayerLeft', { message: `Trò chơi kết thúc do không còn đủ người chơi.` });
            }
        }
    }

    // Thông báo cho những người còn lại trong phòng
    socket.to(roomId).emit('playerLeft', {
        playerId: socket.id,
        username: username, // Gửi username để client có thể hiển thị
        message: `${username} đã rời phòng.`,
        playersInRoom: room.players.length,
        maxPlayers: room.maxPlayers
    });

    io.emit('updateRooms', getRoomsInfo());
    return true;
}

// Kiểm tra và bắt đầu game nếu đủ điều kiện
function checkGameStart(roomId) {
    const room = rooms[roomId];
    if (!room) return;

    // Nếu đủ người chơi và đủ bảng số
    if (room.players.length === room.maxPlayers &&
        Object.keys(room.boardNumbers).length === room.maxPlayers) {

        room.gameActive = true;
        let firstPlayerId;

        if (room.maxPlayers === 2) {
            // Phòng 2 người: Bắt đầu tung đồng xu
            resetCoinToss(roomId); // Đảm bảo reset trước khi bắt đầu mới
            coinToss.roomId = roomId;
            coinToss.player1 = room.players[0].id;
            coinToss.player2 = room.players[1].id;
            io.to(roomId).emit('startCoinToss'); // Báo client bắt đầu tung xu
             // firstPlayerId sẽ được xác định sau khi tung đồng xu
        } else {
            // Phòng 3+ người: Người tạo đi trước, không tung đồng xu
            room.turnOrder = room.players.map(p => p.id); // Tạo thứ tự lượt chơi ban đầu
            room.currentPlayerIndex = room.turnOrder.findIndex(id => id === room.creatorId); // Người tạo đi trước
            if (room.currentPlayerIndex === -1) room.currentPlayerIndex = 0; // Fallback nếu không tìm thấy người tạo
            firstPlayerId = room.turnOrder[room.currentPlayerIndex];

            io.to(roomId).emit('startGame', {
                roomId,
                players: room.players,
                firstPlayerId: firstPlayerId,
                maxPlayersInRoom: room.maxPlayers // Gửi thêm maxPlayers
            });
            console.log(`🚀 Game started in room ${roomId} with ${room.maxPlayers} players. First turn: ${firstPlayerId}`);
        }
        io.emit('updateRooms', getRoomsInfo());
    }
}

// Xử lý socket.io
io.on('connection', (socket) => {
    console.log('🔵 Người dùng mới kết nối:', socket.id);
    connectedUsers++;

    // Gửi lịch sử chat (nếu có) cho người dùng mới
    socket.emit('allChatMessages', chatMessages);

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

    // Gửi thông tin phòng khi có yêu cầu
    socket.on('requestRooms', () => {
        socket.emit('updateRooms', getRoomsInfo());
    });

    // Tạo phòng
    socket.on('createRoom', (data) => { // data giờ là object { username, maxPlayers }
        const { username, maxPlayers } = data;
        const roomId = Math.random().toString(36).substr(2, 6).toUpperCase();
        rooms[roomId] = {
            players: [{ id: socket.id, username }],
            boardNumbers: {},
            gameActive: false,
            maxPlayers: parseInt(maxPlayers) || 2, // Mặc định là 2 nếu không có
            turnOrder: [],
            currentPlayerIndex: 0,
            creatorId: socket.id // Lưu người tạo phòng
        };

        socket.join(roomId);
        socket.roomId = roomId;
        socket.emit('roomCreated', { roomId, username, maxPlayers: rooms[roomId].maxPlayers }); // Gửi maxPlayers về client
        socket.emit('waitingForOpponent', { roomId, currentPlayers: 1, maxPlayers: rooms[roomId].maxPlayers });


        io.emit('chatMessage', {
            sender: 'Hệ thống',
            message: `${username} đã tạo phòng <span class="math-inline">\{roomId\} \(</span>{rooms[roomId].maxPlayers} người chơi)`,
            type: 'system'
        });

        io.emit('updateRooms', getRoomsInfo());
        console.log(`✅ Room ${roomId} created by <span class="math-inline">\{username\} \(</span>{socket.id}) for ${rooms[roomId].maxPlayers} players`);
    });

    // Tham gia phòng
    socket.on('joinRoom', (data) => {
        const { roomId, username } = data;
        const room = rooms[roomId];

        if (room) {
            if (room.players.length < room.maxPlayers) {
                const isPlayerAlreadyInRoom = room.players.some(p => p.id === socket.id);
                if (isPlayerAlreadyInRoom) {
                    socket.emit('errorMessage', 'Bạn đã ở trong phòng này rồi.');
                    return;
                }

                room.players.push({ id: socket.id, username });
                socket.join(roomId);
                socket.roomId = roomId;

                const opponentInfo = room.players.length > 1 ? room.players[0] : null; // Thông tin người chơi đầu tiên (nếu có)

                socket.emit('joinedRoom', {
                    roomId,
                    opponent: opponentInfo, // Có thể là null nếu là người thứ 2 tham gia vào phòng trống
                    playersInRoom: room.players.length,
                    maxPlayers: room.maxPlayers
                });

                // Thông báo cho những người khác trong phòng
                socket.to(roomId).emit('playerJoined', {
                    player: { id: socket.id, username },
                    playersInRoom: room.players.length,
                    maxPlayers: room.maxPlayers
                });

                io.emit('chatMessage', {
                    sender: 'Hệ thống',
                    message: `${username} đã tham gia phòng ${roomId}`,
                    type: 'system'
                });

                if (room.players.length === room.maxPlayers) {
                    checkGameStart(roomId); // Bắt đầu game nếu đủ người
                } else {
                    socket.emit('waitingForOpponent', { roomId, currentPlayers: room.players.length, maxPlayers: room.maxPlayers });
                    // Thông báo cho những người đã ở trong phòng
                    socket.to(roomId).emit('updateWaitingInfo', { currentPlayers: room.players.length, maxPlayers: room.maxPlayers });
                }

                io.emit('updateRooms', getRoomsInfo());
                console.log(`👤 Player <span class="math-inline">\{username\} \(</span>{socket.id}) joined room ${roomId}`);
            } else {
                socket.emit('errorMessage', 'Phòng đã đủ người.');
            }
        } else {
            socket.emit('errorMessage', 'Phòng không tồn tại.');
        }
    });

    // Xử lý rời phòng
    socket.on('leaveRoom', (roomId) => {
        if (leaveRoom(socket, roomId)) {
            // Update rooms list for all clients
            io.emit('updateRooms', getRoomsInfo());
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
                        io.to(roomId).emit('forceCoinSide', forcedChoice); // Thông báo cho script
                    } else if (coinToss.player2Choice && choice === coinToss.player2Choice) {
                        // Người chơi 2 chọn trùng, tự động đổi và thông báo
                        const forcedChoice = choice === 'hình' ? 'chữ' : 'hình';
                        if (socket.id === coinToss.player1) {
                            coinToss.player1Choice = forcedChoice;
                        } else if (socket.id === coinToss.player2) {
                            coinToss.player2Choice = forcedChoice;
                        }
                        io.to(roomId).emit('forceCoinSide', forcedChoice); 
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
                coinToss.result = Math.random() < 0.5 ? "chữ" : "hình";
                let firstPlayerGameId = (coinToss.player1Choice === coinToss.result) ? coinToss.player1 : coinToss.player2;

                // Gửi kết quả tung đồng xu
                io.to(roomId).emit('coinTossResult', {
                    result: coinToss.result,
                    firstPlayerId: firstPlayerGameId, // ID của người đi trước trong game
                    player1Choice: coinToss.player1Choice,
                    player2Choice: coinToss.player2Choice
                });

                // Ngay sau khi có kết quả tung đồng xu, bắt đầu game cho phòng 2 người
                const room = rooms[roomId];
                if (room && room.maxPlayers === 2 && room.gameActive) { // Đảm bảo game đã active và là phòng 2 người
                    room.turnOrder = [coinToss.player1, coinToss.player2]; // Đặt thứ tự lượt chơi
                    room.currentPlayerIndex = room.turnOrder.findIndex(id => id === firstPlayerGameId);

                    io.to(roomId).emit('startGame', { // Gửi sự kiện startGame sau khi có kết quả tung đồng xu
                        roomId,
                        players: room.players,
                        firstPlayerId: firstPlayerGameId,
                        maxPlayersInRoom: room.maxPlayers
                    });
                    console.log(`🚀 Game started in room ${roomId} (2 players) after coin toss. First turn: ${firstPlayerGameId}`);
                }
                resetCoinToss(roomId); // Reset sau khi sử dụng
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
        const room = rooms[roomId];

        if (room && room.gameActive) {
            // Kiểm tra có phải lượt của người chơi này không
            if (room.turnOrder[room.currentPlayerIndex] !== socket.id) {
                // console.log(`Not your turn, ${socket.id}. Current turn: ${room.turnOrder[room.currentPlayerIndex]}`);
                // Không cần gửi lỗi, client nên tự xử lý việc này
                return;
            }

            // Chuyển lượt cho người tiếp theo
            room.currentPlayerIndex = (room.currentPlayerIndex + 1) % room.turnOrder.length;
            const nextPlayerId = room.turnOrder[room.currentPlayerIndex];
            const nextPlayer = room.players.find(p => p.id === nextPlayerId);

            // Gửi thông báo đến tất cả người chơi trong phòng về số được đánh dấu và lượt tiếp theo
            io.to(roomId).emit('numberMarked', {
                number,
                markerId: socket.id,
                nextPlayerId: nextPlayerId, // Gửi ID người chơi tiếp theo
                nextPlayerUsername: nextPlayer ? nextPlayer.username : '' // Gửi username người chơi tiếp theo
            });

            console.log(`🎯 Player ${socket.id} marked number ${number} in room ${roomId}. Next turn: ${nextPlayerId}`);
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
        const room = rooms[roomId];
        if (room && room.players.length === room.maxPlayers) { // Chỉ cho chơi lại nếu đủ người
            room.boardNumbers = {};
            room.gameActive = true; // Sẵn sàng cho game mới
            room.winner = null; // Reset người thắng

            let firstPlayerId;

            if (room.maxPlayers === 2) {
                resetCoinToss(roomId);
                coinToss.roomId = roomId;
                coinToss.player1 = room.players[0].id;
                coinToss.player2 = room.players[1].id;
                io.to(roomId).emit('startCoinToss'); // Bắt đầu lại tung xu cho phòng 2 người
                // firstPlayerId sẽ được xác định sau
            } else {
                // Phòng 3+ người, người tạo phòng cũ vẫn đi trước hoặc theo một logic mới (ví dụ: người thắng ván trước)
                // Giữ nguyên logic người tạo đi trước cho đơn giản
                room.turnOrder = room.players.map(p => p.id);
                room.currentPlayerIndex = room.turnOrder.findIndex(id => id === room.creatorId);
                if (room.currentPlayerIndex === -1) room.currentPlayerIndex = 0;
                firstPlayerId = room.turnOrder[room.currentPlayerIndex];

                // Thông báo game restart và ai đi trước
                io.to(roomId).emit('gameRestart', {
                    firstPlayerId: firstPlayerId,
                    players: room.players,
                    maxPlayersInRoom: room.maxPlayers
                });
            }

            // Yêu cầu client gửi lại boardNumbers
            io.to(roomId).emit('requestNewBoardNumbers');


            console.log(`🔄 Game restart initiated in room ${roomId}`);
        } else if (room) {
            io.to(socket.id).emit('errorMessage', 'Không đủ người chơi để bắt đầu lại.');
        }
    });

    // Ngắt kết nối
    socket.on('disconnect', () => {
        console.log('🔴 Người dùng ngắt kết nối:', socket.id);
        connectedUsers--;

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

// Khởi động server
http.listen(PORT, () => {
    console.log(`🚀 Server is running at http://localhost:${PORT}`);
});