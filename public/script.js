const socket = io();

// --- DOM Elements ---
const usernameScreen = document.getElementById('username-screen'); // Màn hình nhập tên người dùng
const usernameInput = document.getElementById('usernameInput'); // Input để người dùng nhập tên
const usernameSubmitBtn = document.getElementById('usernameSubmitBtn'); // Nút gửi tên người dùng
const welcomeMessage = document.getElementById('welcome-message'); // Lời chào sau khi nhập tên
const roomSelectionDiv = document.getElementById('room-selection'); // Khu vực chọn hoặc tạo phòng
const createRoomBtn = document.getElementById('createRoomBtn'); // Nút tạo phòng mới
const joinRoomBtn = document.getElementById('joinRoomBtn'); // Nút tham gia phòng đã có
const roomInput = document.getElementById('roomInput'); // Input để nhập mã phòng muốn tham gia
const roomStatus = document.getElementById('roomStatus'); // Hiển thị trạng thái phòng (đang tạo, chờ...)
const roomCodeDisplay = document.getElementById('room-code-display'); // Khu vực hiển thị mã phòng
const roomCodeElement = document.getElementById('room-code'); // Phần tử hiển thị mã phòng
const gameContainer = document.getElementById('game-container'); // Khu vực chứa giao diện trò chơi Bingo
const roomInfo = document.getElementById('roomInfo'); // Hiển thị thông tin phòng trong trò chơi
const playersInfo = document.getElementById('playersInfo'); // Hiển thị thông tin người chơi trong phòng
const bingoBoard = document.getElementById('bingo-board'); // Bảng Bingo
const playAgainBtn = document.getElementById('playAgainBtn'); // Nút chơi lại sau khi kết thúc ván
const leaveRoomBtn = document.getElementById('leaveRoomBtn'); // Nút rời phòng
const turnDisplay = document.getElementById('turn-display'); // Hiển thị lượt của người chơi

// --- Game state variables ---
let username = '';
let currentRoomId = '';
let myTurn = false;
let playerNumber = 0;
let myBoardNumbers = [];
let gameActive = false;
let opponents = {};

// --- Username submission ---
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

// --- Room creation ---
createRoomBtn.addEventListener('click', () => {
    if (!username) return;
    socket.emit('createRoom', username);
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

// Socket events 
socket.on('roomCreated', (data) => {
    const { roomId, username } = data;
    currentRoomId = roomId;
    roomStatus.innerText = `Đã tạo phòng thành công!`;
    roomCodeElement.innerText = roomId;
    roomCodeDisplay.style.display = 'block';
    playerNumber = 1;

    // Tạo bảng số ngẫu nhiên và gửi lên server
    myBoardNumbers = generateBingoNumbers();
    socket.emit('boardNumbers', { roomId, numbers: myBoardNumbers, username });
});

socket.on('waitingForOpponent', (roomId) => {
    roomStatus.innerHTML = `<div class="waiting">Đang chờ đối thủ tham gia...</div>`;
});

socket.on('joinedRoom', (data) => {
    const { roomId, opponent } = data;
    currentRoomId = roomId;
    roomStatus.innerText = `Đã tham gia phòng: ${roomId}. Đang chờ game bắt đầu...`;
    opponents[opponent.id] = opponent.username;
    playerNumber = 2;

    // Tạo bảng số mới và gửi lên server
    myBoardNumbers = generateBingoNumbers();
    socket.emit('boardNumbers', { roomId, numbers: myBoardNumbers, username });
});

socket.on('playerJoined', (data) => {
    const { player } = data;
    opponents[player.id] = player.username;
    roomStatus.innerText = `${player.username} đã tham gia phòng!`;
});

socket.on('startGame', (data) => {
    const { roomId, players, firstPlayerId } = data; // Nhận firstPlayerId
    gameActive = true;

    roomSelectionDiv.style.display = 'none';
    gameContainer.style.display = 'block';
    roomInfo.innerText = `Phòng: ${roomId}`;

    // Update players info
    let playersList = '';
    players.forEach(player => {
        if (player.id === socket.id) {
            playersList += `<span class="you">${player.username} (Bạn)</span> `;
        } else {
            playersList += `<span class="opponent">${player.username}</span> `;
            opponents[player.id] = player.username;
        }
    });
    playersInfo.innerHTML = playersList;

    // Determine if it's my turn
    myTurn = firstPlayerId === socket.id; // Sử dụng firstPlayerId

    // Initialize the Bingo board
    initializeBingoBoard();
    updateTurnDisplay();
});

socket.on('numberMarked', (data) => {
    const { number, markerId } = data; // Lấy số đã được đánh dấu và ID của người đã đánh dấu

    if (markerId !== socket.id) {
        // Find and mark the cell that was marked by opponent
        const cells = document.querySelectorAll('.bingo-cell');
        for (let i = 0; i < cells.length; i++) {
            if (parseInt(cells[i].innerText) === number) {
                cells[i].classList.add('marked-by-opponent');
                break;
            }
        }

        // Now it's my turn
        if (gameActive) {
            myTurn = true;
            updateTurnDisplay();
        }

        // Check for win conditions
        checkWin();
    }
});

socket.on('gameWon', (data) => {
    const { winner } = data;
    gameActive = false;

    if (winner === socket.id) {
        alert('Chúc mừng! Bạn đã chiến thắng! BINGO!');
    } else {
        alert(`${opponents[winner] || 'Đối thủ'} đã chiến thắng!`);
    }

    // Disable board interaction
    const cells = document.querySelectorAll('.bingo-cell');
    cells.forEach(cell => {
        cell.style.pointerEvents = 'none';
    });

    // Show play again button
    playAgainBtn.style.display = 'block';
    updateTurnDisplay('Trò chơi đã kết thúc');
});

socket.on('gameRestart', () => {
    gameActive = true;
    playAgainBtn.style.display = 'none';

    // Ẩn bàn Bingo và hiện màn hình tung đồng xu
    gameContainer.style.display = 'none';
    coinTossDiv.style.display = 'block';
    coinTossMessage.innerText = 'Chọn "Hình" hoặc "Chữ" để quyết định người đi trước.';
    chooseHeadsButton.disabled = false;
    chooseTailsButton.disabled = false;
    coinChoiceMade = false;

    // Generate new board numbers
    myBoardNumbers = generateBingoNumbers();
    socket.emit('boardNumbers', { roomId: currentRoomId, numbers: myBoardNumbers, username });

    // Determine turn (player 1 always goes first)
    myTurn = playerNumber === 1;

    // Initialize new board
    initializeBingoBoard();
    updateTurnDisplay();
}); 

socket.on('playerLeft', (playerId) => {
    if (gameActive) {
        alert(`${opponents[playerId] || 'Đối thủ'} đã rời phòng.`);
        gameActive = false;
        const cells = document.querySelectorAll('.bingo-cell');
        cells.forEach(cell => {
            cell.style.pointerEvents = 'none';
        });
        updateTurnDisplay('Đối thủ đã rời phòng');
        playAgainBtn.style.display = 'none'; // Ẩn nút "Chơi lại"
    }

    delete opponents[playerId];
});

socket.on('errorMessage', (msg) => {
    alert(msg);
});

// --- Helper functions ---
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

function generateBingoNumbers() {
    const nums = Array.from({ length: 25 }, (_, i) => i + 1);
    shuffle(nums);
    return nums;
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function updateTurnDisplay(message) {
    if (message) {
        turnDisplay.innerText = message;
        turnDisplay.className = '';
    } else if (gameActive) {
        turnDisplay.innerText = myTurn ? 'Lượt của bạn' : `Lượt của đối thủ`;
        turnDisplay.className = myTurn ? 'your-turn' : 'opponent-turn';
    }
}

function checkWin() {
    if (!gameActive) return;

    const cells = document.querySelectorAll('.bingo-cell');
    const markedCells = Array.from(cells).map(cell =>
        cell.classList.contains('marked') || cell.classList.contains('marked-by-opponent')
    );

    let linesCompleted = 0;

    // Check rows
    for (let row = 0; row < 5; row++) {
        let rowComplete = true;
        for (let col = 0; col < 5; col++) {
            const index = row * 5 + col;
            if (!cells[index].classList.contains('marked') &&
                !cells[index].classList.contains('marked-by-opponent')) {
                rowComplete = false;
                break;
            }
        }
        if (rowComplete) linesCompleted++;
    }

    // Check columns
    for (let col = 0; col < 5; col++) {
        let colComplete = true;
        for (let row = 0; row < 5; row++) {
            const index = row * 5 + col;
            if (!cells[index].classList.contains('marked') &&
                !cells[index].classList.contains('marked-by-opponent')) {
                colComplete = false;
                break;
            }
        }
        if (colComplete) linesCompleted++;
    }

    // Check diagonal (top-left to bottom-right)
    let diag1Complete = true;
    for (let i = 0; i < 5; i++) {
        const index = i * 5 + i;
        if (!cells[index].classList.contains('marked') &&
            !cells[index].classList.contains('marked-by-opponent')) {
            diag1Complete = false;
            break;
        }
    }
    if (diag1Complete) linesCompleted++;

    // Check diagonal (top-right to bottom-left)
    let diag2Complete = true;
    for (let i = 0; i < 5; i++) {
        const index = i * 5 + (4 - i);
        if (!cells[index].classList.contains('marked') &&
            !cells[index].classList.contains('marked-by-opponent')) {
            diag2Complete = false;
            break;
        }
    }
    if (diag2Complete) linesCompleted++;

    document.getElementById('lines-completed').innerText = `Đường hoàn thành: ${linesCompleted}/5`;

    // Check if 5 lines are completed
    if (linesCompleted >= 5) {
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
// Add this to the top of script.js where other DOM elements are defined
const chatContainer = document.getElementById('chat-container');
const messagesList = document.getElementById('messages-list');
const messageInput = document.getElementById('message-input');
const sendMessageBtn = document.getElementById('send-message-btn');
const activeRoomsList = document.getElementById('active-rooms-list');
const winnerModal = document.getElementById('winner-modal');
const winnerMessage = document.getElementById('winner-message');
const closeModalBtn = document.getElementById('close-modal-btn');

// --- Socket events for public chat and room listing ---
socket.on('updateRooms', (rooms) => {
    activeRoomsList.innerHTML = '';

    if (Object.keys(rooms).length === 0) {
        activeRoomsList.innerHTML = '<li class="no-rooms">Không có phòng nào đang hoạt động</li>';
        return;
    }

    Object.keys(rooms).forEach(roomId => {
        const room = rooms[roomId];
        const isFull = room.players.length >= 2;

        if (!isFull) { // Only show rooms that aren't full
            const roomItem = document.createElement('li');
            roomItem.classList.add('room-item');
            roomItem.innerHTML = `
                <span class="room-code">${roomId}</span>
                <span class="room-players">${room.players.length}/2 người chơi</span>
                <button class="join-btn" data-room="${roomId}">Tham gia</button>
            `;
            activeRoomsList.appendChild(roomItem);

            // Add click event for the join button
            const joinBtn = roomItem.querySelector('.join-btn');
            joinBtn.addEventListener('click', () => {
                if (username) {
                    roomInput.value = roomId;
                    currentRoomId = roomId;
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

// --- Game won event updated ---
socket.on('gameWon', (data) => {
    const { winner } = data;
    gameActive = false;

    // Disable board interaction
    const cells = document.querySelectorAll('.bingo-cell');
    cells.forEach(cell => {
        cell.style.pointerEvents = 'none';
    });

    // Show the winner modal
    winnerModal.style.display = 'flex';
    if (winner === socket.id) {
        winnerMessage.innerText = 'Chúc mừng! Bạn đã chiến thắng! BINGO!';
        // Play winner sound if needed
        // const winSound = new Audio('winner.mp3');
        // winSound.play();
    } else {
        winnerMessage.innerText = `${opponents[winner] || 'Đối thủ'} đã chiến thắng!`;
    }

    // Show play again button
    playAgainBtn.style.display = 'block';
    updateTurnDisplay('Trò chơi đã kết thúc');
});

// Close modal when close button is clicked
closeModalBtn.addEventListener('click', () => {
    winnerModal.style.display = 'none';
});

// --- Helper functions for chat ---
function sendMessage() {
    const message = messageInput.value.trim();
    if (message && username) {
        socket.emit('sendMessage', { message, sender: username, room: currentRoomId || 'lobby' });
        messageInput.value = '';
    }
}

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
    messagesList.scrollTop = messagesList.scrollHeight; // Scroll to bottom
}

// Event listeners for chat
sendMessageBtn.addEventListener('click',sendMessage);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Initialize chat at startup
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
coinTossDiv.style.display = 'none'; // Ẩn ban đầu
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
const coinContainer = document.getElementById('coin-container'); // Lấy container
let coinChoiceMade = false; // Thêm biến để theo dõi đã chọn chưa

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
        if (result === 'chữ') { // Nếu kết quả là "chữ"
            coinElement.style.transform = 'rotateY(180deg)';
        } else { // Nếu kết quả là "hình"
            coinElement.style.transform = 'rotateY(0deg)'; // Hoặc có thể là 'rotateY(360deg)' hoặc ''
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


        // Chờ một chút rồi chuyển về màn hình game
        setTimeout(() => {
            if(coinTossDiv) coinTossDiv.style.display = 'none';
            if(gameContainer) gameContainer.style.display = 'block';
            updateTurnDisplay();
            // Tùy chọn: Reset transform của đồng xu để chuẩn bị cho lần tung tiếp theo (nếu cần)
            // coinElement.style.transform = '';
        }, 3000); // Thời gian hiển thị kết quả trước khi về game

    }, 3000); // Thời gian này nên khớp với thời gian của animation 'spinCoin'
});

// Xử lý khi mặt đồng xu không khả dụng (sửa đổi)
socket.on('coinSideUnavailable', (availableSide) => {
    coinTossMessage.innerText = `Mặt này đã được chọn. Bạn phải chọn "${availableSide}".`;
    if (availableSide === 'hình') {
        chooseHeadsButton.disabled = false;
        chooseTailsButton.disabled = true;
    } else if (availableSide === 'chữ') { // Đổi else thành else if
        chooseHeadsButton.disabled = true;
        chooseTailsButton.disabled = false;
    }
});
// Xử lý khi mặt đồng xu bị ép thay đổi
socket.on('forceCoinSide', (forcedSide) => {
    coinTossMessage.innerText = `Đối thủ đã chọn mặt này. Bạn bị ép chọn "${forcedSide}".`;
    // Thêm animation xoay đồng xu (tương tự như trong 'coinTossResult')
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