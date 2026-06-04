const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let players = {};
let gameState = {
    level: 1,
    round: 1, // Hiệp 1 hoặc Hiệp 2
    mushrooms: [],
    star: null
};

const rewards = {
    1: { nam: "Lời tỏ tình từ Nữ", nu: "Tát yêu Nam 5 cái / Vật phẩm tăng HP" },
    2: { nam: "Mời bạn Nữ đi ăn", nu: "Nhận 10.000đ + Tát yêu 10 cái" },
    3: { nam: "Cầm tay bạn Nữ", nu: "Nhận 50.000đ / Tát yêu 20 cái" },
    4: { nam: "Ôm bạn Nữ", nu: "Nhận 500.000đ / Tát yêu 50 cái" },
    5: { nam: "Thơm bạn Nữ", nu: "Nhận 500.000đ + Bó hoa" },
    6: { nam: "Hôn bạn Nữ", nu: "Nhận 1.000.000đ + Bó hoa" }
};

// Hàm tạo Ngôi Sao Hy Vọng ngẫu nhiên ở hiệp 2
function spawnStar() {
    if (gameState.round === 2 && !gameState.star) {
        gameState.star = {
            x: Math.floor(Math.random() * 700) + 50,
            y: Math.floor(Math.random() * 500) + 50
        };
        io.emit('starSpawned', gameState.star);
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (gender) => {
        players[socket.id] = {
            id: socket.id,
            gender: gender,
            hp: 100,
            maxHp: 100,
            power: 15,
            basePower: 15,
            x: gender === 'nam' ? 100 : 700,
            y: 300
        };
        io.emit('updatePlayers', players);
        socket.emit('initLevel', { level: gameState.level, round: gameState.round, reward: rewards[gameState.level] });
        
        // Nếu là hiệp 2, kích hoạt sinh ngôi sao sau 5 giây
        if (gameState.round === 2) setTimeout(spawnStar, 5000);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on('placeMushroom', (data) => {
        let shroom = { id: Date.now(), x: data.x, y: data.y, owner: socket.id, power: players[socket.id].power };
        gameState.mushrooms.push(shroom);
        io.emit('mushroomPlaced', shroom);

        // Nấm nổ sau 1.5 giây
        setTimeout(() => {
            gameState.mushrooms = gameState.mushrooms.filter(m => m.id !== shroom.id);
            io.emit('mushroomExploded', shroom);
        }, 1500);
    });

    // Xử lý trúng bom nấm
    socket.on('hitMushroom', (data) => {
        let target = players[data.targetId];
        if (target) {
            target.hp -= data.damage;
            if (target.hp <= 0) {
                target.hp = 0;
                let winnerId = Object.keys(players).find(id => id !== data.targetId);
                let winner = players[winnerId];
                
                // Thưởng/Phạt sức mạnh cho cửa kế tiếp
                if (winner) {
                    winner.basePower += 5; // Thắng tăng sức mạnh gốc
                    target.basePower = Math.max(5, target.basePower - 3); // Thua giảm sức mạnh
                }

                io.emit('gameOver', { 
                    winner: winner ? winner.gender : 'Hòa', 
                    reward: rewards[gameState.level][winner.gender] 
                });

                // Chuyển sang Hiệp 2 hoặc Cửa tiếp theo
                if (gameState.round === 1) {
                    gameState.round = 2;
                } else {
                    gameState.round = 1;
                    gameState.level = gameState.level < 6 ? gameState.level + 1 : 1;
                }

                // Reset trạng thái trận mới
                gameState.star = null;
                for (let p in players) {
                    players[p].hp = 100;
                    players[p].power = players[p].basePower; // Reset về sức mạnh gốc mới
                    players[p].x = players[p].gender === 'nam' ? 100 : 700;
                    players[p].y = 300;
                }
                io.emit('resetMatch', { level: gameState.level, round: gameState.round, players, reward: rewards[gameState.level] });
            } else {
                io.emit('updatePlayers', players);
            }
        }
    });

    // Xử lý nhặt Ngôi Sao Hy Vọng (X2 sức mạnh)
    socket.on('claimStar', () => {
        if (players[socket.id] && gameState.star) {
            players[socket.id].power *= 2; // Nhân đôi sức mạnh hiện tại
            gameState.star = null;
            io.emit('starClaimed', { playerId: socket.id, gender: players[socket.id].gender });
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy trên port ${PORT}`));
