const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Cho phép mọi Client kết nối đến
        methods: ["GET", "POST"]
    }
});

// --- CẤU HÌNH BIẾN TOÀN CỤC CỦA TRẬN ĐẤU ---
let players = {};
let monsters = [];
let mushrooms = {};
let currentLevel = 1;
let currentRound = 1;

// Danh sách phần thưởng ngọt ngào cho các cặp đôi
const rewards = [
    { nam: "Lời tỏ tình từ Nữ", nu: "Lời tỏ tình từ Nữ" },
    { nam: "Một cái nắm tay", nu: "Một cái nắm tay" },
    { nam: "Cái ôm ấm áp", nu: "Cái ôm ấm áp" },
    { nam: "Nụ hôn lên má", nu: "Nụ hôn lên má" },
    { nam: "Một buổi hẹn hò xem phim", nu: "Một buổi hẹn hò xem phim" }
];
let currentReward = rewards[0];

// Ma trận bản đồ tiêu chuẩn: 0 = Cỏ, 1 = Đá cố định, 2 = Gạch phá hủy được
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

// --- 🎯 HÀM TẠO QUÁI VẬT THÔNG MINH (CHỐNG KẸT ĐÁ/GẠCH TUYỆT ĐỐI) ---
function generateMonsters(currentGrid) {
    let monsterList = [];
    let maxMonsters = 3; // Số lượng quái vật mỗi màn chơi
    let attempts = 0;    // Giới hạn vòng lặp tránh treo server

    if (!currentGrid || !Array.isArray(currentGrid)) {
        return monsterList;
    }

    while (monsterList.length < maxMonsters && attempts < 150) {
        attempts++;

        // Lấy ngẫu nhiên tọa độ theo chiều dọc (Y) và chiều ngang (X) của bản đồ
        let gridY = Math.floor(Math.random() * currentGrid.length);
        let gridX = Math.floor(Math.random() * currentGrid[0].length);

        // Không sinh quái vật ngay góc xuất phát của người chơi (Tránh chết oan lúc vào game)
        if (gridX < 3 && gridY < 3) {
            continue;
        }

        // ĐIỀU KIỆN QUYẾT ĐỊNH: Chỉ lấy ô có giá trị = 0 (CỎ TRỐNG)
        if (currentGrid[gridY][gridX] === 0) {
            // Quy đổi sang tọa độ logic của Phaser hệ số nhân 40
            let logicX = gridX * 40 + 20;
            let logicY = gridY * 40 + 20;

            monsterList.push({
                id: 'monster_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                x: logicX,
                y: logicY,
                gridX: gridX,
                gridY: gridY
            });
        }
    }
    return monsterList;
}

// Khởi tạo danh sách quái vật lần đầu tiên sạch sẽ
monsters = generateMonsters(gameGrid);

// --- HÀM RESET TRẬN ĐẤU KHI LÊN CỬA HOẶC CHẾT ---
function resetMatch() {
    // Khôi phục lại máu cho những người chơi hiện tại
    for (let id in players) {
        players[id].hp = 100;
        if (players[id].gender === 'nam') {
            players[id].x = 60; players[id].y = 60; // Góc trên bên trái
        } else {
            players[id].x = 500; players[id].y = 340; // Góc dưới bên phải
        }
    }
    
    // Tạo lại bản đồ gạch ngẫu nhiên mới
    for (let y = 1; y < gameGrid.length - 1; y++) {
        for (let x = 1; x < gameGrid[y].length - 1; x++) {
            if (gameGrid[y][x] !== 1) {
                if ((x < 3 && y < 3) || (x > 11 && y > 7)) {
                    gameGrid[y][x] = 0; // Giữ trống vị trí đứng của người chơi
                } else {
                    gameGrid[y][x] = Math.random() > 0.4 ? 2 : 0; // 40% tỷ lệ ra gạch cam
                }
            }
        }
    }

    // Làm sạch bom cũ và gọi quái vật mới ra ô cỏ trống
    mushrooms = {};
    monsters = generateMonsters(gameGrid);

    // Phát sự kiện cập nhật trạng thái mới về cho tất cả thiết bị
    io.emit('resetMatch', {
        grid: gameGrid,
        level: currentLevel,
        round: currentRound,
        reward: currentReward
    });
    io.emit('updatePlayers', players);
    io.emit('updateMonsters', monsters);
}

// --- QUẢN LÝ KẾT NỐI REALTIME (SOCKET.IO) ---
io.on('connection', (socket) => {
    console.log(`Người chơi kết nối: ${socket.id}`);

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

        // Gửi toàn bộ dữ liệu ban đầu cho người chơi mới vào
        socket.emit('initGame', {
            grid: gameGrid,
            level: currentLevel,
            round: currentRound,
            reward: currentReward
        });

        io.emit('updatePlayers', players);
        io.emit('updateMonsters', monsters);
    });

    // Đồng bộ di chuyển từ Client lên Server
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            // Phát lại cho người chơi kia nhìn thấy
            socket.broadcast.emit('playerMoved', {
                id: socket.id,
                x: data.x,
                y: data.y
            });
        }
    });

    // Logic Đặt Nấm (Đặt Bom)
    socket.on('placeMushroom', (data) => {
        let shroomID = `shroom_${Date.now()}_${socket.id}`;
        let shroomData = { id: shroomID, x: data.x, y: data.y, owner: socket.id };
        mushrooms[shroomID] = shroomData;

        io.emit('mushroomPlaced', shroomData);

        // Sau 2.5 giây bom nấm sẽ tự động phát nổ
        setTimeout(() => {
            if (mushrooms[shroomID]) {
                let gridX = Math.floor((data.x / 40));
                let gridY = Math.floor((data.y / 40));

                // Các ô chịu ảnh hưởng của vụ nổ (Chữ thập vuông góc)
                let explodedTiles = [{ x: gridX, y: gridY }];
                let directions = [[0,1], [0,-1], [1,0], [-1,0]];

                directions.forEach(dir => {
                    let tx = gridX + dir[0];
                    let ty = gridY + dir[1];

                    if (ty >= 0 && ty < gameGrid.length && tx >= 0 && tx < gameGrid[ty].length) {
                        if (gameGrid[ty][tx] !== 1) { // Không nổ xuyên qua đá cố định
                            explodedTiles.push({ x: tx, y: ty });
                            if (gameGrid[ty][tx] === 2) {
                                gameGrid[ty][tx] = 0; // Phá hủy khối gạch cam thành ô cỏ trống
                            }
                        }
                    }
                });

                delete mushrooms[shroomID];

                // Phát tín hiệu nổ kèm ma trận bản đồ mới cập nhật về Client
                io.emit('mushroomExploded', {
                    shroom: shroomData,
                    explodedTiles: explodedTiles,
                    newGrid: gameGrid
                });
            }
        }, 2500);
    });

    // Xử lý khi người chơi dẫm phải quái hoặc bị nổ trúng
    socket.on('takeDamage', (data) => {
        if (players[socket.id]) {
            players[socket.id].hp -= data.amount;
            if (players[socket.id].hp <= 0) {
                players[socket.id].hp = 0;
                
                // Kết thúc game, tính phần thưởng cho đối phương
                let winnerGender = players[socket.id].gender === 'nam' ? 'nu' : 'nam';
                io.emit('gameOver', {
                    winner: winnerGender,
                    reward: winnerGender === 'nam' ? currentReward.nam : currentReward.nu
                });

                // Chuyển sang hiệp mới sau 4 giây
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
        console.log(`Người chơi ngắt kết nối: ${socket.id}`);
        delete players[socket.id];
        io.emit('updatePlayers', players);
    });
});

// Chạy ứng dụng trên cổng môi trường Render cấp hoặc mặc định 3000
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server đang hoạt động cực mượt tại cổng: ${PORT}`);
});
