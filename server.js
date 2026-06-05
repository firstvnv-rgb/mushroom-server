const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

let players = {};
let monsters = [];
let mushrooms = {};
let items = {}; 
let currentLevel = 1;
let currentRound = 1;

const rewards = [
    { nam: "Lời tỏ tình từ nhân vật Nữ", nu: "Được tát yêu bạn Nam 5 cái HOẶC nhận 1 vật phẩm tăng sức mạnh bất kỳ cho cửa sau" },
    { nam: "Được mời bạn Nữ đi ăn", nu: "Nhận 10.000đ từ bạn Nam và được tát yêu bạn Nam 10 cái" },
    { nam: "Được cầm tay bạn Nữ", nu: "Nhận 50.000đ từ bạn Nam HOẶC tát yêu 20 cái" },
    { nam: "Được ôm bạn Nữ", nu: "Nhận 500.000đ từ bạn Nam HOẶC tát yêu bạn Nam 50 cái" },
    { nam: "Được thơm bạn Nữ", nu: "Nhận 500.000đ và một bó hoa từ bạn Nam" },
    { nam: "Được hôn bạn Nữ", nu: "Nhận 1.000.000đ và một bó hoa từ bạn Nam" }
];

function getCurrentReward() {
    let index = (currentLevel - 1) % 6;
    return rewards[index];
}

let gameGrid = [
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
    [1,0,0,0,0,0,2,0,2,0,0,2,0,0,1], 
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,0,0,2,0,2,0,2,0,2,0,2,0,2,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,2,0,2,0,0,2,0,2,0,0,2,0,2,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,0,2,0,2,0,2,0,2,0,2,0,0,0,1],
    [1,0,1,0,1,0,1,0,1,0,1,0,1,0,1],
    [1,2,0,2,0,0,2,0,2,0,0,0,0,0,1], 
    [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
];

function generateMonsters(currentGrid) {
    let monsterList = [];
    let maxMonsters = 8; 
    let attempts = 0;
    while (monsterList.length < maxMonsters && attempts < 100) {
        attempts++;
        let gridX = Math.floor(Math.random() * 13) + 1;
        let gridY = Math.floor(Math.random() * 9) + 1;
        if ((gridX < 4 && gridY < 4) || (gridX > 10 && gridY > 6)) continue;
        if (currentGrid[gridY] && currentGrid[gridY][gridX] === 0) {
            let id = 'm_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
            monsterList.push({
                id: id, gridX: gridX, gridY: gridY,
                dirX: Math.random() > 0.5 ? 1 : -1, dirY: 0
            });
        }
    }
    return monsterList;
}

monsters = generateMonsters(gameGrid);

function resetMatch() {
    for (let id in players) {
        players[id].hp = 100;
        players[id].moveDelay = 180;
        if (players[id].gender === 'nam') { 
            players[id].gridX = 1; players[id].gridY = 1; 
        } else { 
            players[id].gridX = 13; players[id].gridY = 9; 
        }
    }

    for (let y = 1; y < 10; y++) {
        for (let x = 1; x < 14; x++) {
            if (gameGrid[y][x] !== 1) {
                let isPrinceSafeZone = (x <= 3 && y <= 3);
                let isPrincessSafeZone = (x >= 11 && y >= 7);
                if (isPrinceSafeZone || isPrincessSafeZone) {
                    gameGrid[y][x] = 0; 
                } else {
                    gameGrid[y][x] = Math.random() > 0.45 ? 2 : 0;
                }
            }
        }
    }
    mushrooms = {}; items = {}; monsters = generateMonsters(gameGrid);
    io.emit('resetMatch', { grid: gameGrid, level: currentLevel, round: currentRound, reward: getCurrentReward() });
    io.emit('updatePlayers', players); io.emit('updateMonsters', monsters); io.emit('updateItems', items);
}

setInterval(() => {
    if (monsters.length > 0) {
        monsters.forEach(m => {
            let nextX = m.gridX + m.dirX; let nextY = m.gridY + m.dirY;
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

            for (let pId in players) {
                let pX = Math.round(players[pId].gridX); let pY = Math.round(players[pId].gridY);
                if (pX === m.gridX && pY === m.gridY) {
                    players[pId].hp = Math.max(0, players[pId].hp - 15);
                    io.to(pId).emit('hurtEffect'); io.emit('updatePlayers', players); checkDeath(pId);
                }
            }
        });
        io.emit('updateMonsters', monsters);
    }
}, 450);

// ĐÃ SỬA CHUYỂN ĐỔI: Cơ chế PvP Sinh Tử mới theo đúng yêu cầu của bạn
function checkDeath(pId) {
    if (players[pId] && players[pId].hp <= 0) {
        let currentReward = getCurrentReward();
        
        // 1. Gửi kết quả thua cuộc cho người vừa hết máu trước
        io.to(pId).emit('gameOver');

        // 2. Trao chiến thắng NGAY LẬP TỨC cho người còn sống sót (dù quái còn hay hết)
        for (let otherId in players) {
            if (otherId !== pId) {
                let winner = players[otherId];
                io.to(otherId).emit('gameWin', {
                    winnerId: otherId,
                    rewardText: winner.gender === 'nam' ? currentReward.nam : currentReward.nu
                });
            }
        }
    }
}

io.on('connection', (socket) => {
    socket.on('joinGame', (gender) => {
        let gX = gender === 'nam' ? 1 : 13; let gY = gender === 'nam' ? 1 : 9;
        players[socket.id] = { id: socket.id, gender: gender, gridX: gX, gridY: gY, hp: 100, moveDelay: 180, lastMoveTime: 0 };
        socket.emit('initGame', { grid: gameGrid, level: currentLevel, round: currentRound, reward: getCurrentReward() });
        io.emit('updatePlayers', players); io.emit('updateMonsters', monsters); io.emit('updateItems', items);
    });

    socket.on('requestMove', (dir) => {
        let p = players[socket.id]; if (!p || p.hp <= 0) return;
        let now = Date.now(); if (now - p.lastMoveTime < p.moveDelay) return;
        let nX = Math.round(p.gridX) + dir.dirX; let nY = Math.round(p.gridY) + dir.dirY;

        if (gameGrid[nY] && gameGrid[nY][nX] === 0) {
            p.gridX = nX; p.gridY = nY; p.lastMoveTime = now;
            let itemKey = `${nX}_${nY}`;
            if (items[itemKey]) {
                if (items[itemKey].type === 'speed') p.moveDelay = Math.max(90, p.moveDelay - 20);
                else if (items[itemKey].type === 'heal') p.hp = Math.min(100, p.hp + 25);
                delete items[itemKey]; io.emit('updateItems', items);
            }
            io.emit('playerMoved', { id: socket.id, gridX: nX, gridY: nY }); io.emit('updatePlayers', players);
        }
    });

    socket.on('requestPlant', () => {
        let p = players[socket.id]; if (!p || p.hp <= 0) return;
        let curX = Math.round(p.gridX); let curY = Math.round(p.gridY);
        let shroomKey = `${curX}_${curY}`; if (mushrooms[shroomKey]) return;

        mushrooms[shroomKey] = { id: shroomKey, gridX: curX, gridY: curY, owner: socket.id };
        io.emit('mushroomPlaced', mushrooms[shroomKey]);

        setTimeout(() => {
            if (mushrooms[shroomKey]) {
                let explodedTiles = [{ x: curX, y: curY }];
                let directions = [[0,1], [0,-1], [1,0], [-1,0]];
                directions.forEach(dir => {
                    let tx = curX + dir[0]; let ty = curY + dir[1];
                    if (ty >= 0 && ty < 11 && tx >= 0 && tx < 15) {
                        if (gameGrid[ty][tx] !== 1) {
                            explodedTiles.push({ x: tx, y: ty }); if (gameGrid[ty][tx] === 2) gameGrid[ty][tx] = 0;
                        }
                    }
                });

                let deadPlayerIds = [];
                explodedTiles.forEach(tile => {
                    for (let pId in players) {
                        let pX = Math.round(players[pId].gridX); let pY = Math.round(players[pId].gridY);
                        if (pX === tile.x && pY === tile.y) {
                            io.to(pId).emit('hurtEffect'); 
                            players[pId].hp = Math.max(0, players[pId].hp - 25);
                            io.emit('updatePlayers', players);
                            if (players[pId].hp <= 0) { deadPlayerIds.push(pId); }
                        }
                    }
                });

                explodedTiles.forEach(tile => {
                    monsters = monsters.filter(m => {
                        if (m.gridX === tile.x && m.gridY === tile.y) {
                            if (Math.random() < 0.5) {
                                items[`${tile.x}_${tile.y}`] = { x: tile.x, y: tile.y, type: Math.random() > 0.5 ? 'speed' : 'heal' };
                            }
                            return false;
                        }
                        return true;
                    });
                });

                delete mushrooms[shroomKey];
                io.emit('mushroomExploded', { shroom: { id: shroomKey }, explodedTiles, newGrid: gameGrid });
                io.emit('updateMonsters', monsters); io.emit('updateItems', items);

                // KIỂM TRA ĐIỀU KIỆN KẾT THÚC VÁN THEO LUẬT MỚI:
                if (deadPlayerIds.length > 0) {
                    // Nếu có người trúng bom chết -> Người còn lại thắng ngay (Trường hợp 2)
                    deadPlayerIds.forEach(id => checkDeath(id));
                } else {
                    // Đã loại bỏ logic "quái chết hết thì tự thắng chung". 
                    // Giờ đây quái hết thì game vẫn chạy bình thường cho đến khi có một người gục ngã (Trường hợp 1).
                }
            }
        }, 2000);
    });

    socket.on('nextMatchRequest', (isWin) => {
        if (isWin) {
            currentRound++;
            if (currentRound > 3) {
                currentRound = 1;
                currentLevel++;
            }
        }
        resetMatch();
    });

    socket.on('disconnect', () => { delete players[socket.id]; io.emit('updatePlayers', players); });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`Server live on port ${PORT}`); });
