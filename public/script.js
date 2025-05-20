const socket = io();

// DOM Elements
const usernameScreen = document.getElementById('username-screen');
const usernameInput = document.getElementById('usernameInput');
const usernameSubmitBtn = document.getElementById('usernameSubmitBtn');
const welcomeMessage = document.getElementById('welcome-message');
const roomSelectionDiv = document.getElementById('room-selection');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomInput = document.getElementById('roomInput');
const roomStatus = document.getElementById('roomStatus');
const roomCodeDisplay = document.getElementById('room-code-display');
const roomCodeElement = document.getElementById('room-code');
const gameContainer = document.getElementById('game-container');
const roomInfo = document.getElementById('roomInfo');
const playersInfo = document.getElementById('playersInfo');
const bingoBoard = document.getElementById('bingo-board');
const playAgainBtn = document.getElementById('playAgainBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const turnDisplay = document.getElementById('turn-display');
const chatContainer = document.getElementById('chat-container');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const activeRoomsList = document.getElementById('active-rooms-list');
const winnerModal = document.getElementById('winner-modal');
const winnerMessage = document.getElementById('winner-message');
const closeModalBtn = document.getElementById('close-modal-btn');
const maxPlayersInput = document.getElementById('maxPlayersInput');

// Game state variables
let username = '';
let currentRoomId = '';
let myTurn = false;
let playerNumber = 0;
let myBoardNumbers = [];
let gameActive = false;
let opponents = {};

// Username submission
usernameSubmitBtn.addEventListener('click', () => {
    username = usernameInput.value.trim();
    if (username) {
        usernameScreen.style.display = 'none';
        roomSelectionDiv.style.display = 'block';
        welcomeMessage.innerText = `Xin chào, ${username}!`;
    } else {
        alert('Vui lòng nhập tên của bạn!');
    }
});

// Room creation 
createRoomBtn.addEventListener('click', () => {
    if (!username) return;
    const maxPlayers = parseInt(maxPlayersInput.value); // Lấy giá trị số người chơi
    if (maxPlayers < 2 || maxPlayers > 5) {
        alert('Số người chơi phải từ 2 đến 5.');
        return;
    }
    socket.emit('createRoom', { username, maxPlayers }); // Gửi cả username và maxPlayers
});

// Join room 
joinRoomBtn.addEventListener('click', () => {
    if (!username) return;
    const roomId = roomInput.value.trim().toUpperCase();
    if (roomId) {
        currentRoomId = roomId;
        socket.emit('joinRoom', { roomId, username });
    } else {
        alert('Vui lòng nhập mã phòng!');
    }
});

// Play again
playAgainBtn.addEventListener('click', () => {
    if (currentRoomId) {
        socket.emit('playAgain', currentRoomId);
    }
});

// Leave room 
leaveRoomBtn.addEventListener('click', () => {
    socket.emit('leaveRoom', currentRoomId);
    resetGameState();
    gameContainer.style.display = 'none';
    roomSelectionDiv.style.display = 'block';
    playAgainBtn.style.display = 'none';
    roomCodeDisplay.style.display = 'none';
});

// Socket events:

socket.on('roomCreated', (data) => {
    const { roomId, username, maxPlayers } = data; // Nhận maxPlayers từ server
    currentRoomId = roomId;
    roomStatus.innerText = `Đã tạo phòng thành công! Chờ ${maxPlayers - 1} người chơi nữa.`;
    roomCodeElement.innerText = roomId;
    roomCodeDisplay.style.display = 'block';
    playerNumber = 1; // Người tạo phòng luôn là người chơi số 1 (trong mảng players của phòng)

    myBoardNumbers = generateBingoNumbers();
    socket.emit('boardNumbers', { roomId, numbers: myBoardNumbers, username });

    // Cập nhật thông tin hiển thị số người chơi trong phòng chờ (nếu có)
    // Ví dụ: activeRoomsList
});

socket.on('waitingForOpponent', (roomId) => {
    roomStatus.innerHTML = `<div class="waiting">Đang chờ đối thủ tham gia...</div>`;
});

socket.on('joinedRoom', (data) => {
    const { roomId, opponent, playersInRoom, maxPlayers } = data;
    currentRoomId = roomId;
    roomStatus.innerText = `Đã tham gia phòng: <span class="math-inline">\{roomId\}\. \(</span>{playersInRoom}/${maxPlayers} người chơi). Chờ game bắt đầu...`;
    opponents[opponent.id] = opponent.username; // Giữ lại để tương thích, nhưng bạn có thể quản lý danh sách người chơi đầy đủ hơn
    playerNumber = playersInRoom; // Số thứ tự của người chơi này trong phòng

    myBoardNumbers = generateBingoNumbers();
    socket.emit('boardNumbers', { roomId, numbers: myBoardNumbers, username });

    checkAndEnablePlayAgainButton();
});

socket.on('playerJoined', (data) => {
    const { player, playersInRoom, maxPlayers } = data;
    opponents[player.id] = player.username; // Tương tự như trên
    roomStatus.innerText = `<span class="math-inline">\{player\.username\} đã tham gia phòng\! \(</span>{playersInRoom}/${maxPlayers} người chơi).`;
    // Cập nhật danh sách người chơi hiển thị nếu cần
});

socket.on('startGame', (data) => {
    const { roomId, players, firstPlayerId, maxPlayersInRoom } = data; // Nhận maxPlayersInRoom
    gameActive = true;

    roomSelectionDiv.style.display = 'none';
    gameContainer.style.display = 'block';
    roomInfo.innerText = `Phòng: ${roomId}`;

    let playersList = 'Người chơi: ';
    players.forEach(player => {
        if (player.id === socket.id) {
            playersList += `<span class="you">${player.username} (Bạn)</span>, `;
        } else {
            playersList += `<span class="opponent">${player.username}</span>, `;
            opponents[player.id] = player.username; // Cập nhật danh sách đối thủ
        }
    });
    playersInfo.innerHTML = playersList.slice(0, -2); // Xóa dấu phẩy cuối cùng

    // Xử lý lượt chơi và tung đồng xu
    if (maxPlayersInRoom === 2) {
        // Phòng 2 người, tiếp tục dùng logic tung đồng xu (đã có sẵn)
        // myTurn sẽ được xác định bởi coinTossResult
        coinTossDiv.style.display = 'block'; // Đảm bảo hiện nếu trước đó bị ẩn
    } else {
        // Phòng 3+ người, không tung đồng xu
        coinTossDiv.style.display = 'none'; // Ẩn giao diện tung đồng xu
        myTurn = (firstPlayerId === socket.id);
        updateTurnDisplay(null, players.find(p => p.id === firstPlayerId)?.username);
    }

    initializeBingoBoard();
    // updateTurnDisplay(); // Gọi updateTurnDisplay với tên người chơi nếu là phòng nhiều người
    checkAndEnablePlayAgainButton();
});

socket.on('numberMarked', (data) => {
    const { number, markerId, nextPlayerId, nextPlayerUsername } = data;

    // Tìm và đánh dấu ô bởi người chơi khác (dù là đối thủ hay người chơi khác trong phòng nhiều người)
    const cells = document.querySelectorAll('.bingo-cell');
    for (let i = 0; i < cells.length; i++) {
        if (parseInt(cells[i].innerText) === number) {
            // Phân biệt ô bạn đánh dấu và ô người khác đánh dấu (có thể giữ class 'marked-by-opponent')
            if (markerId !== socket.id) {
                 cells[i].classList.add('marked-by-opponent');
            }
            break;
        }
    }

    // Cập nhật lượt chơi dựa trên nextPlayerId từ server (cho phòng nhiều người)
    // Đối với phòng 2 người, logic cũ myTurn = true vẫn có thể dùng nếu không có nextPlayerId
    if (gameActive) {
        if (nextPlayerId) { // Nếu server gửi nextPlayerId (cho phòng nhiều người)
            myTurn = (socket.id === nextPlayerId);
            updateTurnDisplay(null, nextPlayerUsername);
        } else if (markerId !== socket.id) { // Logic cũ cho phòng 2 người
            myTurn = true;
            updateTurnDisplay();
        }
    }
    checkWin();
});

socket.on('gameWon', (data) => {
    const { winner } = data;
    gameActive = false;

    // Thông báo người chiến thắng (alert và modal)
    if (winner === socket.id) {
        alert('Chúc mừng! Bạn đã chiến thắng! BINGO!'); 
        winnerMessage.innerText = 'Chúc mừng! Bạn đã chiến thắng! BINGO!'; 
    } else {
        alert(`${opponents[winner] || 'Đối thủ'} đã chiến thắng!`); 
        winnerMessage.innerText = `${opponents[winner] || 'Đối thủ'} đã chiến thắng!`; 
    }

    // Hiển thị modal
    winnerModal.style.display = 'flex';

    // Vô hiệu hóa tương tác với bảng
    const cells = document.querySelectorAll('.bingo-cell');
    cells.forEach(cell => {
        cell.style.pointerEvents = 'none';
    });

    // Hiển thị nút "Chơi lại"
    playAgainBtn.style.display = 'block';
    updateTurnDisplay('Trò chơi đã kết thúc');
});

socket.on('gameRestart', (data) => {
    const { firstPlayerId, players, maxPlayersInRoom } = data; // Nhận thêm thông tin
    gameActive = true;
    playAgainBtn.style.display = 'none';
    playAgainBtn.disabled = false;

    if (maxPlayersInRoom === 2) {
        gameContainer.style.display = 'none';
        coinTossDiv.style.display = 'block';
        coinTossMessage.innerText = 'Chọn "Hình" hoặc "Chữ" để quyết định người đi trước.';
        chooseHeadsButton.disabled = false;
        chooseTailsButton.disabled = false;
        coinChoiceMade = false;
    } else {
        coinTossDiv.style.display = 'none'; // Ẩn tung đồng xu
        gameContainer.style.display = 'block'; // Hiện luôn bàn cờ
        myTurn = (socket.id === firstPlayerId); // Xác định lượt chơi
        updateTurnDisplay(null, players.find(p => p.id === firstPlayerId)?.username);
    }


    myBoardNumbers = generateBingoNumbers();
    // Server sẽ emit 'boardNumbers' từ client, không cần emit lại ở đây trừ khi logic thay đổi
    // socket.emit('boardNumbers', { roomId: currentRoomId, numbers: myBoardNumbers, username });

    initializeBingoBoard();
    // updateTurnDisplay(); // Gọi trong if/else ở trên
    checkAndEnablePlayAgainButton();
    winnerModal.style.display = 'none'; // Ẩn modal thắng nếu đang hiển thị
});

socket.on('playerLeft', (data) => {
    const { playerId, message } = data;
    alert(message);
    gameActive = false;
    const cells = document.querySelectorAll('.bingo-cell');
    cells.forEach(cell => {
        cell.style.pointerEvents = 'none';
    });
    updateTurnDisplay('Đối thủ đã rời phòng');
    playAgainBtn.style.display = 'none'; // Ẩn nút "Chơi lại"
    playAgainBtn.disabled = true; // VÔ HIỆU HÓA nút "Chơi lại"
    delete opponents[playerId];
});

socket.on('errorMessage', (msg) => {
    alert(msg);
});

socket.on('requestNewBoardNumbers', () => {
    myBoardNumbers = generateBingoNumbers();
    socket.emit('boardNumbers', { roomId: currentRoomId, numbers: myBoardNumbers, username });
});

function checkAndEnablePlayAgainButton() {
    if (Object.keys(opponents).length >= 1) { // Kiểm tra có đủ người chơi
        playAgainBtn.disabled = false;
    } else {
        playAgainBtn.disabled = true;
    }
}

// Helper functions :
// Khởi tạo bảng Bingo
function initializeBingoBoard() {
    bingoBoard.innerHTML = ''; // Xóa bảng cũ

    for (let i = 0; i < 5; i++) {
        const row = document.createElement('div');
        row.classList.add('bingo-row');

        for (let j = 0; j < 5; j++) {
            const index = i * 5 + j;
            const cell = document.createElement('div');
            cell.classList.add('bingo-cell');
            cell.innerText = myBoardNumbers[index];

            if (gameActive) {
                // Thêm sự kiện click
                cell.addEventListener('click', () => {
                    if (gameActive && myTurn && !cell.classList.contains('marked') && !cell.classList.contains('marked-by-opponent')) {
                        const numberClicked = parseInt(cell.innerText);
                        cell.classList.add('marked');

                        // Gửi số đã đánh dấu lên server
                        socket.emit('markNumber', {
                            roomId: currentRoomId,
                            number: numberClicked
                        });

                        // Chuyển lượt
                        myTurn = false;
                        updateTurnDisplay();

                        // Kiểm tra thắng thua
                        checkWin();
                    }
                });
            }
            row.appendChild(cell);
        }
        bingoBoard.appendChild(row);
    }
}

// Tạo dãy số Bingo ngẫu nhiên
function generateBingoNumbers() {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    shuffle(nums);
    return nums;
}

// Trộn mảng
function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

socket.on('updateTurn', (data) => {
    const { nextPlayerId, nextPlayerUsername } = data;
    myTurn = (socket.id === nextPlayerId);
    updateTurnDisplay(null, nextPlayerUsername); // Truyền tên người chơi tiếp theo
});

function updateTurnDisplay(message, currentPlayerUsername) {
    if (message) {
        turnDisplay.innerText = message;
        turnDisplay.className = '';
    } else if (gameActive) {
        if (myTurn) {
            turnDisplay.innerText = 'Lượt của bạn';
            turnDisplay.className = 'your-turn';
        } else {
            // Hiển thị tên người chơi hiện tại nếu có
            const opponentName = currentPlayerUsername || Object.values(opponents).join(', ') || 'Đối thủ';
            turnDisplay.innerText = `Lượt của ${opponentName}`;
            turnDisplay.className = 'opponent-turn';
        }
    }
}

function checkWin() {
    if (!gameActive) return;

    const cells = document.querySelectorAll('.bingo-cell');

    let linesCompleted = 0;
    let tempLinesCompleted = 0; // Temporary counter for checking the conditions

    // Helper function to check a line (row, col, or diagonal)
    const checkLine = (line) => {
        let myCellsInLine = 0;
        for (const index of line) {
            if (cells[index].classList.contains('marked')) {
                myCellsInLine++;
            }
        }
        return myCellsInLine >= 3; // Returns true if at least 3 cells are marked by the player
    };

    // Check rows
    for (let row = 0; row < 5; row++) {
        const rowIndices = [row * 5, row * 5 + 1, row * 5 + 2, row * 5 + 3, row * 5 + 4];
        if (rowIndices.every(index => cells[index].classList.contains('marked') || cells[index].classList.contains('marked-by-opponent')) && checkLine(rowIndices)) {
            tempLinesCompleted++;
        }
    }

    // Check columns
    for (let col = 0; col < 5; col++) {
        const colIndices = [col, col + 5, col + 10, col + 15, col + 20];
        if (colIndices.every(index => cells[index].classList.contains('marked') || cells[index].classList.contains('marked-by-opponent')) && checkLine(colIndices)) {
            tempLinesCompleted++;
        }
    }

    // Check diagonal (top-left to bottom-right)
    const diag1Indices = [0, 6, 12, 18, 24];
    if (diag1Indices.every(index => cells[index].classList.contains('marked') || cells[index].classList.contains('marked-by-opponent')) && checkLine(diag1Indices)) {
        tempLinesCompleted++;
    }

    // Check diagonal (top-right to bottom-left)
    const diag2Indices = [4, 8, 12, 16, 20];
    if (diag2Indices.every(index => cells[index].classList.contains('marked') || cells[index].classList.contains('marked-by-opponent')) && checkLine(diag2Indices)) {
        tempLinesCompleted++;
    }

    linesCompleted = tempLinesCompleted; // Update the actual counter

    document.getElementById('lines-completed').innerText = `Đường hoàn thành: ${linesCompleted}/2`;

    // Check if 2 lines are completed
    if (linesCompleted >= 2) {
        if (myTurn) announceWin();
        return;
    }
}

function announceWin() {
    if (gameActive) {
        socket.emit('gameWon', currentRoomId);
    }
}

function resetGameState() {
    currentRoomId = '';
    myTurn = false;
    playerNumber = 0;
    myBoardNumbers = [];
    gameActive = false;
    opponents = {};
}

// Close modal when close button is clicked
closeModalBtn.addEventListener('click', () => {
    winnerModal.style.display = 'none';
});

// Chat functions:
// Gửi tin nhắn chat
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && username) {
        socket.emit('sendMessage', { message, sender: username, room: currentRoomId || 'lobby' });
        messageInput.value = '';
    }
}

// Hiển thị tin nhắn
function addMessageToChat(sender, message, type = 'user') {
    const messageItem = document.createElement('li');
    messageItem.classList.add('message-item');

    if (type === 'system') {
        messageItem.classList.add('system-message');
        messageItem.innerText = message;
    } else {
        messageItem.innerHTML = `<strong>${sender}:</strong> ${message}`;
    }
    messagesList.appendChild(messageItem);
    messagesList.scrollTop = messagesList.scrollHeight; 
}

// Gửi tin nhắn
sendMessageBtn.addEventListener('click',sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Socket events for public chat and room listing:
socket.on('updateRooms', (rooms) => {
    activeRoomsList.innerHTML = '';

    if (Object.keys(rooms).length === 0) {
        activeRoomsList.innerHTML = '<li class="no-rooms">Không có phòng nào đang hoạt động</li>';
        return;
    }

    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        // Chỉ hiển thị phòng chưa đầy
        if (room.players.length < room.maxPlayers) {
            const roomItem = document.createElement('li');
            roomItem.classList.add('room-item');
            roomItem.innerHTML = `
                <span class="room-code"><span class="math-inline">\{roomId\}</span\>
                <span class="room-players">{room.players.length}/room.maxPlayers người chơi</span>
                <button class="join-btn" data-room="{roomId}">Tham gia</button>
            `;
            activeRoomsList.appendChild(roomItem);

            // Add click event for the join button
            const joinBtn = roomItem.querySelector('.join-btn');
            joinBtn.addEventListener('click', () => {
                if (username) {
                    roomInput.value = roomId; // Tự điền mã phòng
                    // currentRoomId = roomId; // Không gán ở đây, để server xử lý
                    socket.emit('joinRoom', { roomId, username });
                } else {
                    alert('Vui lòng nhập tên của bạn trước!');
                }
            });
        }
    });
});

socket.on('chatMessage', (data) => {
    const { sender, message, type } = data;
    addMessageToChat(sender, message, type);
});

socket.on('connect', () => {
    addMessageToChat('Hệ thống', 'Chào mừng đến với Bingo Multiplayer!', 'system');
    socket.emit('requestRooms'); // Request current rooms
});

// Nhận toàn bộ lịch sử chat từ server
socket.on('allChatMessages', (messages) => {
    messages.forEach(msg => {
        addMessageToChat(msg.sender, msg.message, msg.type);
    });
});

// Thêm phần tử đồng xu
const coinTossDiv = document.createElement('div');
coinTossDiv.id = 'coin-toss';
coinTossDiv.style.display = 'none'; 
coinTossDiv.innerHTML = `
    <div class="coin-toss-container">
        <h2>Chọn mặt đồng xu</h2>
        <div id="coin-container">
            <div class="coin heads">Hình</div>
            <div class="coin tails">Chữ</div>
        </div>
        <button id="choose-heads">Hình</button>
        <button id="choose-tails">Chữ</button>
        <p id="coin-toss-message"></p>
    </div>
`;
gameContainer.parentNode.insertBefore(coinTossDiv, gameContainer);

const chooseHeadsButton = document.getElementById('choose-heads');
const chooseTailsButton = document.getElementById('choose-tails');
const coinTossMessage = document.getElementById('coin-toss-message');
const coinContainer = document.getElementById('coin-container');
let coinChoiceMade = false;

// Bắt đầu tung đồng xu
socket.on('startCoinToss', () => {
    gameContainer.style.display = 'none'; // Ẩn bàn Bingo
    coinTossDiv.style.display = 'block'; // Hiện phần tung đồng xu
    coinTossMessage.innerText = 'Chọn "Hình" hoặc "Chữ" để quyết định người đi trước.';
    chooseHeadsButton.disabled = false;
    chooseTailsButton.disabled = false;
    coinChoiceMade = false; // Reset khi bắt đầu
});

// Kết quả tung đồng xu
socket.on('coinTossResult', (data) => {
    const { result, firstPlayerId, player1Choice, player2Choice } = data;
    const coinElement = document.getElementById('coin'); // Lấy phần tử coin gốc

    if (!coinElement) {
        console.error('Phần tử #coin không tìm thấy!');
        return;
    }

    coinElement.classList.add('animate-coin'); // Thêm class để chạy animation

    setTimeout(() => {
        coinElement.classList.remove('animate-coin'); // Xóa class animation

        // Thiết lập hướng xoay cuối cùng cho đồng xu
        if (result === 'chữ') { 
            coinElement.style.transform = 'rotateY(180deg)';
        } else { 
            coinElement.style.transform = 'rotateY(0deg)'; 
        }

        // Cập nhật thông báo kết quả
        let message = `Kết quả là "${result}"! `;
        if (firstPlayerId === socket.id) {
            message += 'Bạn được đi trước.';
            myTurn = true;
        } else {
            const opponentUsername = opponents[firstPlayerId] || 'Đối thủ';
            message += `${opponentUsername} được đi trước.`;
            myTurn = false;
        }

        // Xác định lựa chọn của người chơi hiện tại và đối thủ
        let myChoice, opponentChoice;
        if (playerNumber === 1) { // Giả sử playerNumber = 1 nếu là người chơi 1
            myChoice = player1Choice;
            opponentChoice = player2Choice;
        } else {
            myChoice = player2Choice;
            opponentChoice = player1Choice;
        }
        message += ` (Bạn chọn ${myChoice}, Đối thủ chọn ${opponentChoice})`;
        
        if(coinTossMessage) {
            coinTossMessage.innerText = message;
        }

        // Chờ một lúc rồi chuyển về màn hình game
        setTimeout(() => {
            if(coinTossDiv) coinTossDiv.style.display = 'none';
            if(gameContainer) gameContainer.style.display = 'block';
            updateTurnDisplay();
            
            // coinElement.style.transform = '';
        }, 3000); 

    }, 3000); 
});

// Mặt đồng xu không khả dụng
socket.on('coinSideUnavailable', (availableSide) => {
    coinTossMessage.innerText = `Mặt này đã được chọn. Bạn phải chọn "${availableSide}".`;
    if (availableSide === 'hình') {
        chooseHeadsButton.disabled = false;
        chooseTailsButton.disabled = true;
    } else if (availableSide === 'chữ') { 
        chooseHeadsButton.disabled = true;
        chooseTailsButton.disabled = false;
    }
});

// Xử lý khi mặt đồng xu bị ép thay đổi
socket.on('forceCoinSide', (forcedSide) => {
    coinTossMessage.innerText = `Đối thủ đã chọn mặt này. Bạn bị ép chọn "${forcedSide}".`;
    // Animation xoay đồng xu 
    const coin = document.getElementById('coin');
    coin.classList.add('animate-coin');

    setTimeout(() => {
        coin.classList.remove('animate-coin');
        let coinClass = forcedSide === 'hình' ? 'heads' : 'tails';
        let resultDisplay = `<div class="coin ${coinClass}">${forcedSide}</div>`;
        coinContainer.innerHTML = resultDisplay;

        // Vô hiệu hóa nút chọn
        chooseHeadsButton.disabled = true;
        chooseTailsButton.disabled = true;

    }, 3000);
});

// Chọn "Hình"
chooseHeadsButton.addEventListener('click', () => {
    if (!coinChoiceMade) {
        socket.emit('chooseCoinSide', { roomId: currentRoomId, choice: 'hình' });
        chooseHeadsButton.disabled = true;
        chooseTailsButton.disabled = true;
        coinTossMessage.innerText = 'Bạn đã chọn "Hình". Chờ đối thủ chọn...';
        coinChoiceMade = true;
    }
});

// Chọn "Chữ"
chooseTailsButton.addEventListener('click', () => {
    if (!coinChoiceMade) {
        socket.emit('chooseCoinSide', { roomId: currentRoomId, choice: 'chữ' });
        chooseTailsButton.disabled = true;
        chooseTailsButton.disabled = true;
        coinTossMessage.innerText = 'Bạn đã chọn "Chữ". Chờ đối thủ chọn...';
        coinChoiceMade = true;
    }
});