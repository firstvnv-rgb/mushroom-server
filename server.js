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

// --- BIẾN TOÀN CỤC ---
let players = {};
let monsters = [];
let mushrooms = {};
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

// Bản đồ mẫu ban đầu (0: Cỏ, 1: Đá đen, 2: Gạch cam)
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

// --- 🎯 HÀM TẠO QUÁI VẬT KHÔNG BAO GIỜ KẸT ĐÁ ---
function generateMonsters(currentGrid) {
    let monsterList = [];
    let maxMonsters = 3;
    let attempts = 0;

    if (!currentGrid || !Array.isArray(currentGrid)) return monsterList;

    while (monsterList.length < maxMonsters && attempts < 100) {
        attempts++;
        let gridY = Math.floor(Math.random() * currentGrid.length);
        let gridX = Math.floor(Math.random() * currentGrid[0].length);

        // Tránh vị trí xuất phát của người chơi ở các góc
        if ((gridX < 3 && gridY < 3) || (gridX > 11 && gridY > 7)) {
            continue;
        }

        // ĐIỀU KIỆN TIÊN QUYẾT: Chỉ sinh trên ô cỏ (0)
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
                vy: 0
            });
        }
    }
    return monsterList;
}

// Khởi tạo quái vật ban đầu
monsters = generateMonsters(gameGrid);

// --- HÀM LÀM MỚI TRẬN ĐẤU ---
function resetMatch() {
    for (let id in players) {
        players[id].hp = 100;
        if (players[id].gender === 'nam') {
            players[id].x = 60; players[id].y = 60;
        } else {
            players[id].x = 500; players[id].y = 340;
        }
    }

    // Tạo lại địa hình ngẫu nhiên
    for (let y = 1; y < gameGrid.length - 1; y++) {
        for (let x = 1; x < gameGrid[y].length - 1; x++) {
            if (gameGrid[y][x] !== 1) {
                if ((x < 3 && y < 3) || (x > 11 && y > 7)) {
                    gameGrid[y][x] = 0;
                } else {
                    gameGrid[y][x] = Math.random() > 0.45 ? 2 : 0;
                }
            }
        }
    }

    mushrooms = {};
    monsters = generateMonsters(gameGrid);

    io.emit('resetMatch', {
        grid: gameGrid,
        level: currentLevel,
        round: currentRound,
        reward: currentReward
    });
    io.emit('updatePlayers', players);
    io.emit('updateMonsters', monsters);
}

// --- VÒNG LẶP CẬP NHẬT CHUYỂN ĐỘNG QUÁI VẬT (FIX LỖI CRASH TRÊN SERVER) ---
setInterval(() => {
    if (monsters.length > 0) {
        monsters.forEach(m => {
            // Cho quái vật di chuyển qua lại cơ bản tự động trên hệ tọa độ logic
            m.x += m.vx * 1.5;
            m.gridX = Math.floor(m.x / 40);
            
            // Xử lý va chạm biên bản đồ cơ bản để quay đầu
            if (m.gridX <= 0 || m.gridX >= 14 || gameGrid[m.gridY][m.gridX] === 1 || gameGrid[m.gridY][m.gridX] === 2) {
                m.vx *= -1;
                m.x += m.vx * 2;
            }
        });
        io.emit('updateMonsters', monsters);
    }
}, 100);

// --- QUẢN LÝ SOCKET.IO ---
io.on('connection', (socket) => {
    console.log(`Kết nối mới: ${socket.id}`);

    socket.on('joinGame', (gender) => {
        let startX = gender === 'nam' ? 60 : 500;
        let startY = gender === 'nam' ? 60 : 340;

        players[socket.id] = {
            id: socket.id,
            gender: gender,
            x: startX,
            y: startY,
            hp: 100
        };

        socket.emit('initGame', {
            grid: gameGrid,
            level: currentLevel,
            round: currentRound,
            reward: currentReward
        });

        io.emit('updatePlayers', players);
        io.emit('updateMonsters', monsters);
    });

    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: data.x,
                y: data.y
            });
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
                    let tx = gridX + dir[0];
                    let ty = gridY + dir[1];
                    if (ty >= 0 && ty < gameGrid.length && tx >= 0 && tx < gameGrid[ty].length) {
                        if (gameGrid[ty][tx] !== 1) {
                            explodedTiles.push({ x: tx, y: ty });
                            if (gameGrid[ty][tx] === 2) gameGrid[ty][tx] = 0;
                        }
                    }
                });

                delete mushrooms[shroomID];

                io.emit('mushroomExploded', {
                    shroom: shroomData,
                    explodedTiles: explodedTiles,
                    newGrid: gameGrid
                });
            }
        }, 2500);
    });

    socket.on('takeDamage', (data) => {
        if (players[socket.id]) {
            players[socket.id].hp -= data.amount;
            if (players[socket.id].hp <= 0) {
                players[socket.id].hp = 0;
                let winnerGender = players[socket.id].gender === 'nam' ? 'nu' : 'nam';
                
                io.emit('gameOver', {
                    winner: winnerGender,
                    reward: winnerGender === 'nam' ? currentReward.nam : currentReward.nu
                });

                setTimeout(() => {
                    currentRound++;
                    if (currentRound > 3) {
                        currentRound = 1;
                        currentLevel++;
                        let rewardIndex = (currentLevel - 1) % rewards.length;
                        currentReward = rewards[rewardIndex];
                    }
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

// Chạy ứng dụng bảo mật cổng Render
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server chạy thành công tại cổng: ${PORT}`);
});
