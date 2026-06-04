const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

let players = {};
let gameState = {
    level: 1,
    mushrooms: [],
    star: null
};

// Phần thưởng theo từng cửa
const rewards = {
    1: { nam: "Lời tỏ tình từ Nữ", nu: "Tát yêu Nam 5 cái / Vật phẩm tăng HP" },
    2: { nam: "Mời bạn Nữ đi ăn", nu: "Nhận 10.000đ + Tát yêu 10 cái" },
    3: { nam: "Cầm tay bạn Nữ", nu: "Nhận 50.000đ / Tát yêu 20 cái" },
    4: { nam: "Ôm bạn Nữ", nu: "Nhận 500.000đ / Tát yêu 50 cái" },
    5: { nam: "Thơm bạn Nữ", nu: "Nhận 500.000đ + Bó hoa" },
    6: { nam: "Hôn bạn Nữ", nu: "Nhận 1.000.000đ + Bó hoa" }
};

io.on('connection', (socket) => {
    console.log('Có người kết nối: ' + socket.id);

    // Cho phép người chơi chọn giới tính
    socket.on('joinGame', (gender) => {
        players[socket.id] = {
            id: socket.id,
            gender: gender, // 'nam' hoặc 'nu'
            hp: 100,
            power: 10,
            x: gender === 'nam' ? 50 : 250,
            y: 150
        };
        io.emit('updatePlayers', players);
        socket.emit('initLevel', { level: gameState.level, reward: rewards[gameState.level] });
    });

    // Xử lý đặt nấm
    socket.on('placeMushroom', (data) => {
        let shroom = { id: Date.now(), x: data.x, y: data.y, owner: socket.id };
        gameState.mushrooms.push(shroom);
        io.emit('updateMushrooms', gameState.mushrooms);

        // Nấm nổ sau 2 giây
        setTimeout(() => {
            gameState.mushrooms = gameState.mushrooms.filter(m => m.id !== shroom.id);
            io.emit('mushroomExplode', shroom);
            io.emit('updateMushrooms', gameState.mushrooms);
        }, 2000);
    });

    // Xử lý khi có người trúng sát thương hoặc nhặt Ngôi sao hy vọng
    socket.on('takeDamage', (targetId) => {
        if (players[targetId]) {
            players[targetId].hp -= players[socket.id].power;
            if (players[targetId].hp <= 0) {
                // Xử lý phân thắng bại cửa hiện tại
                let winner = players[socket.id].gender;
                io.emit('gameOver', { winner: winner, reward: rewards[gameState.level][winner] });
                // Reset hoặc lên cửa tiếp theo
                gameState.level = gameState.level < 6 ? gameState.level + 1 : 1;
                for (let p in players) { players[p].hp = 100; } // Reset HP
            }
            io.emit('updatePlayers', players);
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy trên port ${PORT}`));
