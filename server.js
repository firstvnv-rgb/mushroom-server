const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let players = {};
let gameState = {
    level: 1, round: 1, mushrooms: [], star: null,
    // Định nghĩa bản đồ tường gạch ẩn (1: có tường, 0: đường đi)
    bricks: [
        {x: 200, y: 200}, {x: 200, y: 400}, {x: 400, y: 200}, {x: 400, y: 400},
        {x: 600, y: 300}, {x: 300, y: 100}, {x: 500, y: 500}
    ],
    // Danh sách quái vật
    monsters: [
        { id: 1, x: 300, y: 300, vx: 2, vy: 0 },
        { id: 2, x: 500, y: 200, vx: 0, vy: 2 }
    ]
};

const rewards = {
    1: { nam: "Lời tỏ tình từ Nữ", nu: "Tát yêu Nam 5 cái / Vật phẩm tăng HP" },
    2: { nam: "Mời bạn Nữ đi ăn", nu: "Nhận 10.000đ + Tát yêu 10 cái" },
    3: { nam: "Cầm tay bạn Nữ", nu: "Nhận 50.000đ / Tát yêu 20 cái" },
    4: { nam: "Ôm bạn Nữ", nu: "Nhận 500.000đ / Tát yêu 50 cái" },
    5: { nam: "Thơm bạn Nữ", nu: "Nhận 500.000đ + Bó hoa" },
    6: { nam: "Hôn bạn Nữ", nu: "Nhận 1.000.000đ + Bó hoa" }
};

// Vòng lặp cập nhật di chuyển của Quái Vật trên Server (60 khung hình / giây)
setInterval(() => {
    gameState.monsters.forEach(monster => {
        monster.x += monster.vx;
        monster.y += monster.vy;

        // Quái chạm biên tự quay đầu
        if (monster.x < 50 || monster.x > 750) monster.vx *= -1;
        if (monster.y < 50 || monster.y > 550) monster.vy *= -1;
    });
    io.emit('updateMonsters', gameState.monsters);
}, 1000 / 60);

io.on('connection', (socket) => {
    socket.on('joinGame', (gender) => {
        players[socket.id] = {
            id: socket.id, gender: gender, hp: 100, maxHp: 100,
            power: 20, basePower: 20,
            x: gender === 'nam' ? 80 : 720, y: 300
        };
        io.emit('updatePlayers', players);
        socket.emit('initLevel', { 
            level: gameState.level, round: gameState.round, 
            reward: rewards[gameState.level], bricks: gameState.bricks 
        });
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

        setTimeout(() => {
            gameState.mushrooms = gameState.mushrooms.filter(m => m.id !== shroom.id);
            io.emit('mushroomExploded', shroom);
        }, 1500);
    });

    // Xử lý khi người chơi mất máu (do nấm hoặc do bị quái cắn)
    socket.on('takeDamage', (data) => {
        let target = players[socket.id];
        if (target) {
            target.hp -= data.amount;
            if (target.hp <= 0) {
                target.hp = 0;
                let winnerId = Object.keys(players).find(id => id !== socket.id);
                let winner = players[winnerId];
                
                if (winner) {
                    winner.basePower += 5;
                    target.basePower = Math.max(5, target.basePower - 3);
                }

                io.emit('gameOver', { winner: winner ? winner.gender : 'Quái Vật', reward: winner ? rewards[gameState.level][winner.gender] : "Cả hai đều bị phạt!" });

                // Reset trận mới
                gameState.round = gameState.round === 1 ? 2 : 1;
                if (gameState.round === 1) gameState.level = gameState.level < 6 ? gameState.level + 1 : 1;

                for (let p in players) {
                    players[p].hp = 100;
                    players[p].power = players[p].basePower;
                    players[p].x = players[p].gender === 'nam' ? 80 : 720;
                    players[p].y = 300;
                }
                io.emit('resetMatch', { level: gameState.level, round: gameState.round, players, reward: rewards[gameState.level] });
            } else {
                io.emit('updatePlayers', players);
            }
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('updatePlayers', players); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy trên port ${PORT}`));
