// Hàm tạo danh sách quái vật không bao giờ bị kẹt vào đá (1) hoặc gạch (2)
function generateMonsters(grid) {
    let monsters = [];
    let maxMonsters = 3; // Số lượng quái vật mỗi màn
    let attempts = 0;    // Biến bảo vệ chống lặp vô hạn

    while (monsters.length < maxMonsters && attempts < 100) {
        attempts++;

        // Sinh ngẫu nhiên tọa độ theo ô lưới (Grid)
        // Giả định map tiêu chuẩn có chiều rộng 15 ô và chiều cao 11 ô
        let gridX = Math.floor(Math.random() * 15);
        let gridY = Math.floor(Math.random() * 11);

        // ❌ KHÔNG sinh quái vật ở quá gần góc xuất phát của Player (ví dụ góc top-left)
        if (gridX < 3 && gridY < 3) {
            continue;
        }

        // 🎯 ĐIỀU KIỆN QUAN TRỌNG: Chỉ sinh quái vật nếu ô đó là CỎ TRỐNG (giá trị = 0)
        if (grid[gridY] && grid[gridY][gridX] === 0) {
            
            // Tính toán tọa độ tâm ô logic (hệ số nhân 40 tương thích với client)
            let logicX = gridX * 40 + 20; 
            let logicY = gridY * 40 + 20;

            monsters.push({
                id: `monster_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
                x: logicX,
                y: logicY,
                vx: Math.random() > 0.5 ? 1 : -1, // Hướng di chuyển ban đầu
                vy: 0,
                speed: 1
            });
        }
    }

    return monsters;
}

// Khi khởi tạo một trận đấu mới hoặc đổi map:
// let currentMonsters = generateMonsters(gameGrid);
