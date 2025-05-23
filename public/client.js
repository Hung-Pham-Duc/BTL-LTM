const socket = io.connect();

// Biến và DOM 
var username;
var turn = 0;
var lastMove;
// Các phần tử âm thanh
var one = document.getElementById("one");
var two = document.getElementById("two");
var yt = document.getElementById("yt");
var wina = document.getElementById("wina");
var wins = document.getElementById("wins");

display = document.getElementById("display");

// Chuyển văn bản thành giọng nói
let synth = speechSynthesis;
voiceSelected = "Google हिन्दी";

// Hàm chuyển văn bản thành giọng nói
function textToSpeech(text) {
    let utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voiceSelected;  
    synth.speak(utterance); 
}

// Vô hiệu hóa/kích hoạt các ô trên bảng
function Access(controller) {
    if (controller == 0) {
        for (x = 0; x < 5; x++) {
            for (y = 0; y < 5; y++) {
                document.getElementById('a' + x.toString() + y.toString()).disabled = true;
            }
        }
    }
    else {
        for (x = 0; x < 5; x++) {
            for (y = 0; y < 5; y++) {
                document.getElementById('a' + x.toString() + y.toString()).disabled = false;
            }
        }
    }
}

// Xử lý tên người dùng
do {
    username = prompt('Enter your name :');
} while (!username)

if (username) {
    // Xử lý khi có tên người dùng
    textToSpeech(`${username}, welcome to awesome bingo game coded by Abhishek`);
    socket.emit('user-data', (username));
    Access(1);
}

// Xử lý tin nhắn
function giveMessage(username, status) {
    var newp = document.createElement('p')
    newp.classList.add('players')
    
    if (status == 'connect') {
        newp.innerHTML = `${username} joined the server....`;

    }
    
    else if(status == 'winner')
    {
        document.querySelector('#turn').innerHTML = `${username} wins ...` ;
        block = true ;
            
    }
        
    else if(status == 'turnY')
    {
        document.querySelector('#turn').innerHTML = `Your turn (Last Move: ${lastMove})` ;
        // yt.play();
        textToSpeech(` ${username} it's your turn`);
    }
    
    else if(status == 'turn')
    {
        document.querySelector('#turn').innerHTML = `Opponent's turn` ;

    }
    else {
        newp.innerHTML = `${username} got disconnected ....`;
    }
        
    console.log(username + "joined!!!!");
    
    display.appendChild(newp);
}

// Xử lý game
const Numbers = new Array();
const Seq = new Array();
const Rows = new Array(5); // checks which row is completed
const Cols = new Array(5); // checks which column is completed
const diag = [];
var Completer = 0;

var block = false; // Ngăn chặn tương tác sau khi có người thắng

for (x = 1; x <= 25; x++) {
    Numbers.push(x);
}

// Tạo dãy số ngẫu nhiên
function getSequence() {
    var i = Numbers.length ;
    while (Numbers.length) {
        let x = Numbers.length
        var i = Math.floor(Math.random() * x);
        Seq.push(Numbers[i]);

        temp = Numbers[i]
        Numbers[i] = Numbers[x - 1];
        Numbers[x - 1] = temp;

        Numbers.pop();

    }
}

// Tạo dãy số
getSequence();

const cells = new Array(5);

// Điền số vào các ô trên bảng
function fillCells() {
    var index = 0;
    for (x = 0; x < 5; x++) {
        cells[x] = new Array(5);
        for (y = 0; y < 5; y++) {
          
            giveId = "a" + x.toString() + y.toString();
            var e = document.getElementById(giveId);
            e.innerText = Seq[index];
            cells[x][y] = Seq[index];
            index++;
        }
    }

    // console.log(cells);
}

// Điền tất cả các ô với số nguyên ngẫu nhiên từ 1 tới 25
fillCells()

// Gửi dữ liệu ô khi người chơi chọn
function giveCellData(value) {
    value = value.toString();

    // send turns data to everyone :
    if(!block)
    {
       turn++ ;
       socket.emit('turn',turn) ;
    }

    if (value.length == 1) {
        value = "0" + value;
    }

    if(cells[parseInt(value[0])][parseInt(value[1])] !=0)
    {
        // change color of cell :
        console.log(value);
        var s = document.getElementById("a" + value)
        s.style.backgroundColor = "rgb(215, 95, 61)";
        s.style.textDecoration = "line-through"
    
        // send this data to all connected users ...
        // console.log(s.innerText);
        socket.emit('cell-data', s.innerText);
    
        cells[parseInt(value[0])][parseInt(value[1])] = 0;
    
        // call perfect Match function for match :
        perfectMatch();
    }
    else
    {
        alert("Already selected")
    }
}

// Kiểm tra các hàng/cột/đường chéo đã hoàn thành
function perfectMatch() {
    // check if a row is completed :
    for (x = 0; x < 5; x++) {
        counter = 0;

        for (y = 0; y < 5; y++) {
            if (cells[x][y] == 0) {
                counter++;
            }
        }

        if (counter == 5 && !Rows.includes(x)) {
            Rows.push(x);
            console.log('got a row');
            changeColor(x, 'row')

        }
    }

    // check if a column is completed :
    for (x = 0; x < 5; x++) {
        counter = 0;

        for (y = 0; y < 5; y++) {
            if (cells[y][x] == 0) {
                counter++;
            }
        }

        if (counter == 5 && !Cols.includes(x)) {
            Cols.push(x)
            console.log('got a column');
            changeColor(x, 'column')

        }
    }

    // check if a diagonal is completed :
    if (diag.length != 2) {
        counter1 = 0, counter2 = 0;
        for (x = 0; x < 5; x++) {
            for (y = 0; y < 5; y++) {
                if (x == y && cells[x][y] == 0) {
                    counter1++;
                }
                if (x + y == 4 && cells[x][y] == 0) {
                    counter2++;
                }
            }
        }

        if (counter1 == 5 && !diag.includes(1)) {
            diag.push(1)
            changeColor(1, 'diagoanl')
        }

        if (counter2 == 5 && !diag.includes(2)) {
            diag.push(2)
            changeColor(2, 'diagoanl')
        }
    }
}

// Thay đổi màu sắc các ô khi hàng/cột/đường chéo hoàn thành
function changeColor(c, type) {
    one.play();

    BINGO = document.getElementById("b" + Completer.toString());
    BINGO.style.textDecoration = "line-through"
    BINGO.style.backgroundColor = "rgb(29, 240, 191)"
    Completer++; // increase the value for next cell

    if (Completer == 5) {

        socket.emit('winner', (username));  // phát sự kiện 'winner' kèm tên người chiến thắng
        
        if(username == 'Abhishek')
        {
            wina.play() ;
        }
        else
        {
            wins.play();
        }
        setTimeout(() => {
         location.href = "https://media.tenor.com/-Yf9G_sGZ-8AAAAC/youre-a-winner-winner.gif" ;
        }, 2000);
        
    }
    
    if (type == 'row') {
        for (x = 0; x < 5; x++) {
            var e = document.getElementById("a" + c.toString() + x.toString());
            e.style.backgroundColor = "rgb(141, 227, 10)";
        }
    }
    else if (type == 'column') {
        for (x = 0; x < 5; x++) {
            var e = document.getElementById("a" + x.toString() + c.toString());
            e.style.backgroundColor = "rgb(141, 227, 10)";
        }
    }
    else {
        for (x = 0; x < 5; x++) {
            for (y = 0; y < 5; y++) {
                var e = document.getElementById("a" + x.toString() + y.toString());
                if (c == 1 && x == y) {
                    e.style.backgroundColor = "rgb(141, 227, 10)";
                }
                else if (c == 2 && (x + y == 4)) {
                    e.style.backgroundColor = "rgb(141, 227, 10)";
                }
            }
        }
    }
}

// Hiển thị tên người dùng
socket.on('user-data', (username) => {
    two.play()
    giveMessage(username, 'connect');
});

// Khi có người thắng
socket.on('winner', (player) => {
    Access(0) ;
    console.log(player + " wins");
    giveMessage(player,'winner')
});

// Xác định lượt chơi
socket.on('turn', (user) => {
    if(user == username)
    {
        giveMessage(username,'turnY')
        console.log("your turn");
        Access(1) ;
            
    }
    else
    {
        giveMessage(username,'turn')
        console.log("someone's turn");
        Access(0) ;
    }
});

// Chọn ô từ dữ liệu được gửi bởi người dùng khác
socket.on('cell-data', (value) => {

    console.log("I received" + value);
    lastMove = value
    
    // send turns data to everyone :
    if(!block)
    {
        turn++ ;
        socket.emit('turn',turn) ;
    }
   
    for (x = 0; x < 5; x++) {
        for (y = 0; y < 5; y++) {
            if (cells[x][y] == value) {

                value = (x.toString() + y.toString())
                // change color of cell :
                var s = document.getElementById("a" + value)
                s.style.backgroundColor = "rgb(215, 95, 61)";
                s.style.textDecoration = "line-through"
             
                cells[parseInt(value[0])][parseInt(value[1])] = 0;

                // Gọi hàm pfMatch để ktra trùng lặp
                perfectMatch();
                break;

            }
        }
    }
});