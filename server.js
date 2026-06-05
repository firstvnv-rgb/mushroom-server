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
    let maxMonsters = 4;
    let attempts = 0;

    while (monsterList.length < maxMonsters && attempts < 150) {
        attempts++;
        let gridY = Math.floor(Math.random() * currentGrid.length);
        let gridX = Math.floor(Math.random() * currentGrid[0].length);

        if ((gridX < 3 && gridY < 3) || (gridX > 11 && gridY > 7)) continue;

        if (currentGrid[gridY][gridX] === 0) {
            monsterList.push({
                id: 'monster_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                gridX: gridX,
                gridY: gridY,
                x: gridX * 40 + 20,
                y: gridY * 40 + 20,
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
        if (players[id].gender === 'nam') { players[id].x = 60; players[id].y = 60; }
        else { players[id].x = 500; players[id].y = 340; }
    }
    for (let y = 1; y < gameGrid.length - 1; y++) {
        for (let x = 1; x < gameGrid[y].length - 1; x++) {
            if (gameGrid[y][x] !== 1) {
                if ((x < 3 && y < 3) || (x > 11 && y > 7)) gameGrid[y][x] = 0;
                else gameGrid[y][x] = Math.random() > 0.4 ? 2 : 0;
            }
        }
    }
    mushrooms = {}; items = {}; monsters = generateMonsters(gameGrid);
    io.emit('resetMatch', { grid: gameGrid, level: currentLevel, round: currentRound, reward: currentReward });
    io.emit('updatePlayers', players); io.emit('updateMonsters', monsters); io.emit('updateItems', items);
}

// 🎯 AI DI CHUYỂN GRID-BASED: Tuyệt đối không bao giờ đi xuyên tường
setInterval(() => {
    if (monsters.length > 0) {
        monsters.forEach(m => {
            let nextX = m.gridX + m.dirX;
            let nextY = m.gridY + m.dirY;

            // Kiểm tra xem ô tiếp theo có phải là cỏ trống (0) không
            if (nextY >= 0 && nextY < gameGrid.length && nextX >= 0 && nextX < gameGrid[0].length && gameGrid[nextY][nextX] === 0) {
                m.gridX = nextX;
                m.gridY = nextY;
                m.x = m.gridX * 40 + 20;
                m.y = m.gridY * 40 + 20;
            } else {
                // Nếu gặp đá (1) hoặc gạch (2), lập tức đổi hướng ngẫu nhiên sang ô cỏ khác
                let dirs = [[0,1], [0,-1], [1,0], [-1,0]];
                let validDirs = dirs.filter(d => {
                    let tx = m.gridX + d[0];
                    let ty = m.gridY + d[1];
                    return ty >= 0 && ty < gameGrid.length && tx >= 0 && tx < gameGrid[0].length && gameGrid[ty][tx] === 0;
                });
                if (validDirs.length > 0) {
                    let chosen = validDirs[Math.floor(Math.random() * validDirs.length)];
                    m.dirX = chosen[0];
                    m.dirY = chosen[1];
                } else {
                    m.dirX *= -1; m.dirY *= -1; // Quay đầu nếu bị kẹt đường cụt
                }
            }
        });
        io.emit('updateMonsters', monsters);
    }
}, 400); // Di chuyển từng ô sau mỗi 400ms cực chuẩn Bomberman

io.on('connection', (socket) => {
    socket.on('joinGame', (gender) => {
        let startX = gender === 'nam' ? 60 : 500;
        let startY = gender === 'nam' ? 60 : 340;
        players[socket.id] = { id: socket.id, gender: gender, x: startX, y: startY, hp: 100, speedBoost: 0 };
        socket.emit('initGame', { grid: gameGrid, level: currentLevel, round: currentRound, reward: currentReward });
        io.emit('updatePlayers', players); io.emit('updateMonsters', monsters); io.emit('updateItems', items);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            let pGridX = Math.floor(data.x / 40);
            let pGridY = Math.floor(data.y / 40);
            let itemKey = `${pGridX}_${pGridY}`;
            
            if (items[itemKey]) {
                let currentItem = items[itemKey];
                if (currentItem.type === 'speed') {
                    players[socket.id].speedBoost += 30;
                    socket.emit('playerBuff', { type: 'speed', amount: players[socket.id].speedBoost });
                } else if (currentItem.type === 'heal') {
                    players[socket.id].hp = Math.min(100, players[socket.id].hp + 25);
                }
                delete items[itemKey];
                io.emit('updateItems', items); io.emit('updatePlayers', players);
            }
            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on('placeMushroom', (data) => {
        let shroomID = `shroom_${Date.now()}_${socket.id}`;
        let shroomData = { id: shroomID, x: data.x, y: data.y, owner: socket.id };
        mushrooms[shroomID] = shroomData;
        io.emit('mushroomPlaced', shroomData);

        setTimeout(() => {
            if (mushrooms[shroomID]) {
                let gridX = Math.floor((data.x / 40));
                let gridY = Math.floor((data.y / 40));
                let explodedTiles = [{ x: gridX, y: gridY }];
                let directions = [[0,1], [0,-1], [1,0], [-1,0]];

                directions.forEach(dir => {
                    let tx = gridX + dir[0]; let ty = gridY + dir[1];
                    if (ty >= 0 && ty < gameGrid.length && tx >= 0 && tx < gameGrid[0].length) {
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
                            if (Math.random() < 0.6) { // 60% tỷ lệ rơi đồ
                                let itemType = Math.random() > 0.5 ? 'speed' : 'heal';
                                items[`${tile.x}_${tile.y}`] = { x: tile.x, y: tile.y, type: itemType };
                            }
                            monsters.splice(i, 1);
                        }
                    }

                    // Tự dẫm bom mình hoặc đồng đội nổ trúng đều mất 25 máu!
                    for (let pId in players) {
                        let pTileX = Math.floor(players[pId].x / 40);
                        let pTileY = Math.floor(players[pId].y / 40);
                        if (pTileX === tile.x && pTileY === tile.y) {
                            io.to(pId).emit('hurtEffect', { amount: 25 });
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

                delete mushrooms[shroomID];
                io.emit('mushroomExploded', { shroom: shroomData, explodedTiles: explodedTiles, newGrid: gameGrid });
                io.emit('updateMonsters', monsters); io.emit('updateItems', items); io.emit('updatePlayers', players);
            }
        }, 2500);
    });

    socket.on('takeDamage', (data) => {
        if (players[socket.id]) {
            players[socket.id].hp -= data.amount;
            if (players[socket.id].hp <= 0) {
                players[socket.id].hp = 0;
                let winnerGender = players[socket.id].gender === 'nam' ? 'nu' : 'nam';
                io.emit('gameOver', { winner: winnerGender, reward: winnerGender === 'nam' ? currentReward.nam : currentReward.nu });
                setTimeout(() => { currentRound++; if (currentRound > 3) { currentRound = 1; currentLevel++; } resetMatch(); }, 4000);
            } else { io.emit('updatePlayers', players); }
        }
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('updatePlayers', players); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server Live tại cổng: ${PORT}`); });
