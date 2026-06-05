const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

let players = {};
let gameState = {
    level: 1, round: 1, mushrooms: [], 
    MAP_WIDTH: 15, MAP_HEIGHT: 11, TILE_SIZE: 40,
    grid: [] 
};

let monsters = [];

const rewards = {
    1: { nam: "Lời tỏ tình từ Nữ", nu: "Tát yêu Nam 5 cái" },
    2: { nam: "Mời bạn Nữ đi ăn", nu: "Nhận 10.000đ + Tát yêu 10 cái" },
    3: { nam: "Cầm tay bạn Nữ", nu: "Nhận 50.000đ / Tát yêu 20 cái" },
    4: { nam: "Ôm bạn Nữ", nu: "Nhận 500.000đ / Tát yêu 50 cái" },
    5: { nam: "Thơm bạn Nữ", nu: "Nhận 500.000đ + Bó hoa" },
    6: { nam: "Hôn bạn Nữ", nu: "Nhận 1.000.000đ + Bó hoa" }
};

function generateMap() {
    gameState.grid = [];
    for (let y = 0; y < gameState.MAP_HEIGHT; y++) {
        let row = [];
        for (let x = 0; x < gameState.MAP_WIDTH; x++) {
            if (x === 0 || y === 0 || x === gameState.MAP_WIDTH - 1 || y === gameState.MAP_HEIGHT - 1) {
                row.push(1);
            } else if (x % 2 === 0 && y % 2 === 0) {
                row.push(1);
            } else {
                if ((x < 3 && y < 3) || (x > gameState.MAP_WIDTH - 4 && y > gameState.MAP_HEIGHT - 4)) {
                    row.push(0);
                } else {
                    row.push(Math.random() < 0.35 ? 2 : 0);
                }
            }
        }
        gameState.grid.push(row);
    }
    // Hồi sinh quái vật tại các vị trí trống giữa bản đồ khi đổi map
    monsters = [
        { id: 1, x: 260, y: 220, speed: 1 },
        { id: 2, x: 340, y: 180, speed: 1 }
    ];
}

generateMap();

setInterval(() => {
    if (Object.keys(players).length === 0 || monsters.length === 0) return;
    
    monsters.forEach(m => {
        let target = null;
        let minDist = 999990;
        for (let id in players) {
            let dist = Math.hypot(players[id].x - m.x, players[id].y - m.y);
            if (dist < minDist) { minDist = dist; target = players[id]; }
        }

        if (target) {
            let angle = Math.atan2(target.y - m.y, target.x - m.x);
            let nextX = m.x + Math.cos(angle) * m.speed;
            let nextY = m.y + Math.sin(angle) * m.speed;

            let gridX = Math.floor(nextX / gameState.TILE_SIZE);
            let gridY = Math.floor(nextY / gameState.TILE_SIZE);
            
            if (gameState.grid[gridY] && gameState.grid[gridY][gridX] === 0) {
                m.x = nextX;
                m.y = nextY;
            }
        }
    });
    io.emit('updateMonsters', monsters);
}, 1000 / 45);

io.on('connection', (socket) => {
    socket.on('joinGame', (gender) => {
        let startX = gender === 'nam' ? 60 : (gameState.MAP_WIDTH - 2) * gameState.TILE_SIZE + 20;
        let startY = gender === 'nam' ? 60 : (gameState.MAP_HEIGHT - 2) * gameState.TILE_SIZE + 20;

        players[socket.id] = {
            id: socket.id, gender: gender, hp: 100, maxHp: 100,
            bombRange: 2, speed: 4, x: startX, y: startY
        };
        
        io.emit('updatePlayers', players);
        socket.emit('initGame', { 
            level: gameState.level, round: gameState.round, 
            reward: rewards[gameState.level], grid: gameState.grid 
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
        let gX = Math.floor(data.x / gameState.TILE_SIZE);
        let gY = Math.floor(data.y / gameState.TILE_SIZE);
        let snapX = gX * gameState.TILE_SIZE + gameState.TILE_SIZE / 2;
        let snapY = gY * gameState.TILE_SIZE + gameState.TILE_SIZE / 2;

        let shroom = { 
            id: Date.now(), x: snapX, y: snapY, gridX: gX, gridY: gY,
            owner: socket.id, range: players[socket.id].bombRange 
        };
        
        gameState.mushrooms.push(shroom);
        io.emit('mushroomPlaced', shroom);

        setTimeout(() => {
            gameState.mushrooms = gameState.mushrooms.filter(m => m.id !== shroom.id);
            let explodedTiles = [{x: shroom.gridX, y: shroom.gridY}];
            let directions = [[0,1], [0,-1], [1,0], [-1,0]]; 

            directions.forEach(dir => {
                for (let i = 1; i <= shroom.range; i++) {
                    let tX = shroom.gridX + dir[0] * i;
                    let tY = shroom.gridY + dir[1] * i;

                    if (tY >= 0 && tY < gameState.MAP_HEIGHT && tX >= 0 && tX < gameState.MAP_WIDTH) {
                        let tileType = gameState.grid[tY][tX];
                        if (tileType === 1) break; 
                        
                        explodedTiles.push({x: tX, y: tY});
                        if (tileType === 2) { 
                            gameState.grid[tY][tX] = 0; 
                            break; 
                        }
                    }
                }
            });

            // 💥 XỬ LÝ DIỆT QUÁI VẬT: Lọc bỏ quái vật đứng trong ô nổ
            monsters = monsters.filter(m => {
                let mGridX = Math.floor(m.x / gameState.TILE_SIZE);
                let mGridY = Math.floor(m.y / gameState.TILE_SIZE);
                // Nếu quái trùng tọa độ ô nổ thì loại bỏ (chết)
                let isHit = explodedTiles.some(t => t.x === mGridX && t.y === mGridY);
                return !isHit;
            });

            io.emit('mushroomExploded', { shroom, explodedTiles, newGrid: gameState.grid });
            io.emit('updateMonsters', monsters);
        }, 1600);
    });

    socket.on('takeDamage', (data) => {
        let target = players[socket.id];
        if (target) {
            target.hp -= data.amount;
            if (target.hp <= 0) {
                target.hp = 0;
                let winnerId = Object.keys(players).find(id => id !== socket.id);
                let winner = players[winnerId];

                io.emit('gameOver', { 
                    winner: winner ? winner.gender : 'Quái Vật', 
                    reward: winner ? rewards[gameState.level][winner.gender] : "Hai bạn đều thua rồi!" 
                });

                gameState.round = gameState.round === 1 ? 2 : 1;
                if (gameState.round === 1) gameState.level = gameState.level < 6 ? gameState.level + 1 : 1;

                generateMap(); 

                for (let p in players) {
                    players[p].hp = 100;
                    players[p].x = players[p].gender === 'nam' ? 60 : (gameState.MAP_WIDTH - 2) * gameState.TILE_SIZE + 20;
                    players[p].y = players[p].gender === 'nam' ? 60 : (gameState.MAP_HEIGHT - 2) * gameState.TILE_SIZE + 20;
                }
                io.emit('resetMatch', { level: gameState.level, round: gameState.round, players, grid: gameState.grid, reward: rewards[gameState.level] });
            } else {
                io.emit('updatePlayers', players);
            }
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('updatePlayers', players); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server chạy tại port ${PORT}`));
