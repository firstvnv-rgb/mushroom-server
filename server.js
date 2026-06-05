const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// --- BIẾN TOÀN CỤC HỆ THỐNG ---
let players = {};
let monsters = [];
let mushrooms = {};
let items = {}; // 🎁 Lưu trữ danh sách vật phẩm rơi trên bản đồ
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

// Bản đồ 15x11: 0: Cỏ, 1: Đá cố định, 2: Gạch phá hủy được
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

// --- 🎯 HÀM TẠO QUÁI VẬT CHUẨN (CHỈ SINH TRÊN CỎ TRỐNG 0) ---
function generateMonsters(currentGrid) {
    let monsterList = [];
    let maxMonsters = 4; // Tăng lên 4 con cho kịch tính
    let attempts = 0;

    if (!currentGrid || !Array.isArray(currentGrid)) return monsterList;

    while (monsterList.length < maxMonsters && attempts < 150) {
        attempts++;
        let gridY = Math.floor(Math.random() * currentGrid.length);
        let gridX = Math.floor(Math.random() * currentGrid[0].length);

        // Tránh vị trí đứng ban đầu của cặp đôi
        if ((gridX < 3 && gridY < 3) || (gridX > 11 && gridY > 7)) {
            continue;
        }

        if (currentGrid[gridY][gridX] === 0) {
            let logicX = gridX * 40 + 20;
            let logicY = gridY * 40 + 20;

            monsterList.push({
                id: 'monster_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                x: logicX,
                y: logicY,
                gridX: gridX,
                gridY: gridY,
                vx: Math.random() > 0.5 ? 1 : -1,
                vy: Math.random() > 0.5 ? 1 : -1, // Di chuyển cả 2 chiều chéo ngẫu nhiên
                hp: 1 // Quái vật có 1 máu, trúng bom là đi đời
            });
        }
    }
    return monsterList;
}

monsters = generateMonsters(gameGrid);

// --- HÀM RESET MAP TRẬN ĐẤU MỚI ---
function resetMatch() {
    for (let id in players) {
        players[id].hp = 100;
        players[id].speedBoost = 0; // Reset vật phẩm bổ trợ
        if (players[id].gender === 'nam') {
            players[id].x = 60; players[id].y = 60;
        } else {
            players[id].x = 500; players[id].y = 340;
        }
    }

    for (let y = 1; y < gameGrid.length - 1; y++) {
        for (let x = 1; x < gameGrid[y].length - 1; x++) {
            if (gameGrid[y][x] !== 1) {
                if ((x < 3 && y < 3) || (x > 11 && y > 7)) {
                    gameGrid[y][x] = 0;
                } else {
                    gameGrid[y][x] = Math.random() > 0.4 ? 2 : 0;
                }
            }
        }
    }

    mushrooms = {};
    items = {}; // Xóa sạch vật phẩm cũ rơi trên sân
    monsters = generateMonsters(gameGrid);

    io.emit('resetMatch', {
        grid: gameGrid,
        level: currentLevel,
        round: currentRound,
        reward: currentReward
    });
    io.emit('updatePlayers', players);
    io.emit('updateMonsters', monsters);
    io.emit('updateItems', items);
}

// --- VÒNG LẶP AI QUÁI VẬT DI CHUYỂN TUẦN TRA ---
setInterval(() => {
    if (monsters.length > 0) {
        monsters.forEach(m => {
            m.x += m.vx * 1.2;
            m.y += m.vy * 1.2;
            
            m.gridX = Math.floor(m.x / 40);
            m.gridY = Math.floor(m.y / 40);
            
            // Va chạm đổi hướng thông minh khi đâm vào Đá hoặc Gạch
            if (m.gridX <= 0 || m.gridX >= 14 || gameGrid[m.gridY][m.gridX] === 1 || gameGrid[m.gridY][m.gridX] === 2) {
                m.vx *= -1;
                m.x += m.vx * 3;
            }
            if (m.gridY <= 0 || m.gridY >= 10 || gameGrid[m.gridY][m.gridX] === 1 || gameGrid[m.gridY][m.gridX] === 2) {
                m.vy *= -1;
                m.y += m.vy * 3;
            }
        });
        io.emit('updateMonsters', monsters);
    }
}, 100);

// --- HỆ THỐNG XỬ LÝ LỆNH REALTIME ---
io.on('connection', (socket) => {
    console.log(`Kết nối kết đôi thành công: ${socket.id}`);

    socket.on('joinGame', (gender) => {
        let startX = gender === 'nam' ? 60 : 500;
        let startY = gender === 'nam' ? 60 : 340;

        players[socket.id] = {
            id: socket.id,
            gender: gender,
            x: startX,
            y: startY,
            hp: 100,
            speedBoost: 0 // Biến hỗ trợ nhặt giày tăng tốc
        };

        socket.emit('initGame', {
            grid: gameGrid,
            level: currentLevel,
            round: currentRound,
            reward: currentReward
        });

        io.emit('updatePlayers', players);
        io.emit('updateMonsters', monsters);
        io.emit('updateItems', items);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            
            // XỬ LÝ CHECK NHẶT VẬT PHẨM (ITEMS) TẠI ĐÂY
            let pGridX = Math.floor(data.x / 40);
            let pGridY = Math.floor(data.y / 40);
            let itemKey = `${pGridX}_${pGridY}`;
            
            if (items[itemKey]) {
                let currentItem = items[itemKey];
                if (currentItem.type === 'speed') {
                    players[socket.id].speedBoost += 40; // Tăng tốc chạy cho client
                    socket.emit('playerBuff', { type: 'speed', amount: players[socket.id].speedBoost });
                } else if (currentItem.type === 'heal') {
                    players[socket.id].hp = Math.min(100, players[socket.id].hp + 30); // Hồi 30 máu
                }
                delete items[itemKey]; // Xóa vật phẩm khỏi bản đồ sau khi ăn
                io.emit('updateItems', items);
                io.emit('updatePlayers', players);
            }

            socket.broadcast.emit('playerMoved', { id: socket.id, x: data.x, y: data.y });
        }
    });

    socket.on('placeMushroom', (data) => {
        let shroomID = `shroom_${Date.now()}_${socket.id}`;
        let shroomData = { id: shroomID, x: data.x, y: data.y, owner: socket.id };
        mushrooms[shroomID] = shroomData;

        io.emit('mushroomPlaced', shroomData);

        // Sau 2.5 giây đếm ngược nấm phát nổ
        setTimeout(() => {
            if (mushrooms[shroomID]) {
                let gridX = Math.floor((data.x / 40));
                let gridY = Math.floor((data.y / 40));
                let explodedTiles = [{ x: gridX, y: gridY }];
                let directions = [[0,1], [0,-1], [1,0], [-1,0]];

                directions.forEach(dir => {
                    let tx = gridX + dir[0];
                    let ty = gridY + dir[1];
                    if (ty >= 0 && ty < gameGrid.length && tx >= 0 && tx < gameGrid[ty].length) {
                        if (gameGrid[ty][tx] !== 1) {
                            explodedTiles.push({ x: tx, y: ty });
                            if (gameGrid[ty][tx] === 2) gameGrid[ty][tx] = 0; // Phá hủy gạch
                        }
                    }
                });

                // ⚡ TÍNH TOÁN VA CHẠM VỤ NỔ VỚI QUÁI VẬT VÀ NGƯỜI CHƠI (TỰ TRÚNG CŨNG MẤT MÁU)
                explodedTiles.forEach(tile => {
                    // 1. Quái vật dính bom nổ: Chết và Rơi đồ ngẫu nhiên
                    for (let i = monsters.length - 1; i >= 0; i--) {
                        let mTileX = Math.floor(monsters[i].x / 40);
                        let mTileY = Math.floor(monsters[i].y / 40);
                        if (mTileX === tile.x && mTileY === tile.y) {
                            // Tạo ngẫu nhiên vật phẩm (Tỷ lệ 70% rơi đồ khi quái chết)
                            if (Math.random() < 0.7) {
                                let itemType = Math.random() > 0.5 ? 'speed' : 'heal'; // Giày tăng tốc hoặc Bình hồi máu
                                items[`${tile.x}_${tile.y}`] = { x: tile.x, y: tile.y, type: itemType };
                            }
                            monsters.splice(i, 1); // Xóa sổ quái vật
                        }
                    }

                    // 2. Người chơi dính bom nổ: CHÍNH MÌNH HAY ĐỒNG ĐỘI ĐỀU BỊ TRỪ 25 MÁU!
                    for (let pId in players) {
                        let pTileX = Math.floor(players[pId].x / 40);
                        let pTileY = Math.floor(players[pId].y / 40);
                        if (pTileX === tile.x && pTileY === tile.y) {
                            // Kích hoạt trừ máu qua socket hệ thống
                            io.to(pId).emit('hurtEffect', { amount: 25 });
                            players[pId].hp -= 25;
                            
                            if (players[pId].hp <= 0) {
                                players[pId].hp = 0;
                                let winnerGender = players[pId].gender === 'nam' ? 'nu' : 'nam';
                                io.emit('gameOver', {
                                    winner: winnerGender,
                                    reward: winnerGender === 'nam' ? currentReward.nam : currentReward.nu
                                });
                                setTimeout(() => {
                                    currentRound++;
                                    if (currentRound > 3) { currentRound = 1; currentLevel++; }
                                    resetMatch();
                                }, 4000);
                            }
                        }
                    }
                });

                delete mushrooms[shroomID];

                io.emit('mushroomExploded', { shroom: shroomData, explodedTiles: explodedTiles, newGrid: gameGrid });
                io.emit('updateMonsters', monsters);
                io.emit('updateItems', items);
                io.emit('updatePlayers', players);
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
                setTimeout(() => {
                    currentRound++;
                    if (currentRound > 3) { currentRound = 1; currentLevel++; }
                    resetMatch();
                }, 4000);
            } else {
                io.emit('updatePlayers', players);
            }
        }
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Hệ thống game bom tấn chạy mượt mà tại cổng: ${PORT}`);
});
