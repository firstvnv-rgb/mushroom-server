const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

let players = {};
let monsters = [];
let mushrooms = {};
let items = {}; 
let currentLevel = 1;
let currentRound = 1;

const rewards = [
    { nam: "Lời tỏ tình từ Nữ", nu: "Lời tỏ tình từ Nữ" },
    { nam: "Một cái nắm tay", nu: "Một cái nắm tay" },
    { nam: "Cái ôm ấm áp", nu: "Cái ôm ấm áp" },
    { nam: "Nụ hôn lên má", nu: "Nụ hôn lên má" },
    { nam: "Một buổi hẹn hò xem phim", nu: "Một buổi hẹn hò xem phim" }
];
let currentReward = rewards[0];

// Bản đồ 15x11 cố định hệ lưới Grid
let gameGrid = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,2,0,0,2,0,2,0,0,2,0,0,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,2,0,2,0,2,0,2,0,2,0,2,0,2,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,2,0,2,0,0,2,0,2,0,0,2,0,2,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,0,2,0,2,0,2,0,2,0,2,0,2,0,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,2,0,2,0,0,2,0,2,0,0,2,0,2,1],
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

function generateMonsters(currentGrid) {
    let monsterList = [];
    let maxMonsters = 3;
    let attempts = 0;

    while (monsterList.length < maxMonsters && attempts < 100) {
        attempts++;
        let gridX = Math.floor(Math.random() * 15);
        let gridY = Math.floor(Math.random() * 11);

        if ((gridX < 3 && gridY < 3) || (gridX > 11 && gridY > 7)) continue;

        if (currentGrid[gridY] && currentGrid[gridY][gridX] === 0) {
            monsterList.push({
                id: 'monster_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                gridX: gridX,
                gridY: gridY,
                dirX: Math.random() > 0.5 ? 1 : -1,
                dirY: 0
            });
        }
    }
    return monsterList;
}

monsters = generateMonsters(gameGrid);

function resetMatch() {
    for (let id in players) {
        players[id].hp = 100;
        players[id].speedBoost = 0;
        if (players[id].gender === 'nam') { players[id].gridX = 1; players[id].gridY = 1; }
        else { players[id].gridX = 13; players[id].gridY = 9; }
    }
    // Tạo lại gạch ngẫu nhiên giữ nguyên đá
    for (let y = 1; y < 10; y++) {
        for (let x = 1; x < 14; x++) {
            if (gameGrid[y][x] !== 1) {
                if ((x < 3 && y < 3) || (x > 11 && y > 7)) gameGrid[y][x] = 0;
                else gameGrid[y][x] = Math.random() > 0.45 ? 2 : 0;
            }
        }
    }
    mushrooms = {}; items = {}; monsters = generateMonsters(gameGrid);
    io.emit('resetMatch', { grid: gameGrid, level: currentLevel, round: currentRound, reward: currentReward });
    io.emit('updatePlayers', players); io.emit('updateMonsters', monsters); io.emit('updateItems', items);
}

// AI chuyển động tuần tra chuẩn ô lưới không bao giờ xuyên tường
setInterval(() => {
    if (monsters.length > 0) {
        monsters.forEach(m => {
            let nextX = m.gridX + m.dirX;
            let nextY = m.gridY + m.dirY;

            if (nextY >= 0 && nextY < 11 && nextX >= 0 && nextX < 15 && gameGrid[nextY][nextX] === 0) {
                m.gridX = nextX; m.gridY = nextY;
            } else {
                let dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                let validDirs = dirs.filter(d => {
                    let tx = m.gridX + d[0]; let ty = m.gridY + d[1];
                    return ty >= 0 && ty < 11 && tx >= 0 && tx < 15 && gameGrid[ty][tx] === 0;
                });
                if (validDirs.length > 0) {
                    let chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
                    m.dirX = chosen[0]; m.dirY = chosen[1];
                } else { m.dirX *= -1; m.dirY *= -1; }
            }
        });
        io.emit('updateMonsters', monsters);
    }
}, 500);

io.on('connection', (socket) => {
    socket.on('joinGame', (gender) => {
        let gX = gender === 'nam' ? 1 : 13;
        let gY = gender === 'nam' ? 1 : 9;
        players[socket.id] = { id: socket.id, gender: gender, gridX: gX, gridY: gY, hp: 100, speedBoost: 0 };
        
        socket.emit('initGame', { grid: gameGrid, level: currentLevel, round: currentRound, reward: currentReward });
        io.emit('updatePlayers', players); io.emit('updateMonsters', monsters); io.emit('updateItems', items);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].gridX = data.gridX;
            players[socket.id].gridY = data.gridY;

            let itemKey = `${data.gridX}_${data.gridY}`;
            if (items[itemKey]) {
                if (items[itemKey].type === 'speed') {
                    players[socket.id].speedBoost = Math.min(100, players[socket.id].speedBoost + 25);
                    socket.emit('playerBuff', { type: 'speed', amount: players[socket.id].speedBoost });
                } else if (items[itemKey].type === 'heal') {
                    players[socket.id].hp = Math.min(100, players[socket.id].hp + 25);
                }
                delete items[itemKey];
                io.emit('updateItems', items); io.emit('updatePlayers', players);
            }
            socket.broadcast.emit('playerMoved', { id: socket.id, gridX: data.gridX, gridY: data.gridY });
        }
    });

    socket.on('placeMushroom', (data) => {
        let shroomKey = `${data.gridX}_${data.gridY}`;
        mushrooms[shroomKey] = { id: shroomKey, gridX: data.gridX, gridY: data.gridY, owner: socket.id };
        io.emit('mushroomPlaced', mushrooms[shroomKey]);

        setTimeout(() => {
            if (mushrooms[shroomKey]) {
                let explodedTiles = [{ x: data.gridX, y: data.gridY }];
                let directions = [[0,1], [0,-1], [1,0], [-1,0]];

                directions.forEach(dir => {
                    let tx = data.gridX + dir[0]; let ty = data.gridY + dir[1];
                    if (ty >= 0 && ty < 11 && tx >= 0 && tx < 15) {
                        if (gameGrid[ty][tx] !== 1) {
                            explodedTiles.push({ x: tx, y: ty });
                            if (gameGrid[ty][tx] === 2) gameGrid[ty][tx] = 0;
                        }
                    }
                });

                explodedTiles.forEach(tile => {
                    // Quái trúng bom chết rơi đồ độc quyền
                    for (let i = monsters.length - 1; i >= 0; i--) {
                        if (monsters[i].gridX === tile.x && monsters[i].gridY === tile.y) {
                            if (Math.random() < 0.6) {
                                let itemType = Math.random() > 0.5 ? 'speed' : 'heal';
                                items[`${tile.x}_${tile.y}`] = { x: tile.x, y: tile.y, type: itemType };
                            }
                            monsters.splice(i, 1);
                        }
                    }
                    // Tự trúng bom mất 25 máu
                    for (let pId in players) {
                        if (players[pId].gridX === tile.x && players[pId].gridY === tile.y) {
                            io.to(pId).emit('hurtEffect');
                            players[pId].hp -= 25;
                            if (players[pId].hp <= 0) {
                                players[pId].hp = 0;
                                let winnerGender = players[pId].gender === 'nam' ? 'nu' : 'nam';
                                io.emit('gameOver', { winner: winnerGender, reward: winnerGender === 'nam' ? currentReward.nam : currentReward.nu });
                                setTimeout(() => { currentRound++; if (currentRound > 3) { currentRound = 1; currentLevel++; } resetMatch(); }, 4000);
                            }
                        }
                    }
                });

                delete mushrooms[shroomKey];
                io.emit('mushroomExploded', { shroom: { id: shroomKey }, explodedTiles, newGrid: gameGrid });
                io.emit('updateMonsters', monsters); io.emit('updateItems', items); io.emit('updatePlayers', players);
            }
        }, 2000);
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('updatePlayers', players); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Hệ thống Server Live tại cổng: ${PORT}`); });
