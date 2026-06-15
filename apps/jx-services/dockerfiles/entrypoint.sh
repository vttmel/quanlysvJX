#!/bin/bash
set -e

# 0. Tự động làm sạch các biến môi trường khỏi ký tự \r ẩn (do CRLF khi clone ở máy khác)
export APP_CMD=$(echo -n "$APP_CMD" | tr -d '\r')
export JX_IP=$(echo -n "$JX_IP" | tr -d '\r')
export JX_MYSQL_IP=$(echo -n "$JX_MYSQL_IP" | tr -d '\r')
export JX_PAYSYS_IP=$(echo -n "$JX_PAYSYS_IP" | tr -d '\r')
export CONFIG_FILE=$(echo -n "$CONFIG_FILE" | tr -d '\r')

# 1. Xác định IP máy chạy JX
if [ -z "$JX_IP" ] || [ "$JX_IP" = "auto" ]; then
    JX_IP=$(hostname -I | awk '{print $1}')
fi

# Mặc định IP MySQL là 127.0.0.1 nếu để auto hoặc trống
if [ -z "$JX_MYSQL_IP" ] || [ "$JX_MYSQL_IP" = "auto" ]; then
    JX_MYSQL_IP="127.0.0.1"
fi

# Mặc định IP Paysys là 127.0.0.1 nếu để auto hoặc trống
if [ -z "$JX_PAYSYS_IP" ] || [ "$JX_PAYSYS_IP" = "auto" ]; then
    JX_PAYSYS_IP="127.0.0.1"
fi

echo "=========================================="
echo " JX Auto IP Detection & Config Updater"
echo " Active IP JX : $JX_IP"
echo " Active IP SQL: $JX_MYSQL_IP"
echo " Active IP Pay: $JX_PAYSYS_IP"
echo "=========================================="

update_ini_key() {
    local file="$1"
    local section="$2"
    local key="$3"
    local value="$4"
    local temp_update="/tmp/$(basename "$file").update"

    awk -v target_section="$section" -v target_key="$key" -v replacement="$value" '
        function trim(value) {
            gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
            return value
        }
        BEGIN {
            active = 0
            target_section = tolower(target_section)
            target_key = tolower(target_key)
        }
        /^[[:space:]]*\[[^]]+\][[:space:]]*$/ {
            section_name = $0
            sub(/^[[:space:]]*\[/, "", section_name)
            sub(/\][[:space:]]*$/, "", section_name)
            active = (tolower(trim(section_name)) == target_section)
        }
        {
            if (active) {
                separator_index = index($0, "=")
                if (separator_index > 0) {
                    left = substr($0, 1, separator_index - 1)
                    right = substr($0, separator_index + 1)
                    key_name = tolower(trim(left))
                    if (key_name == target_key && left !~ /^[[:space:]]*[;#]/) {
                        match(right, /^[[:space:]]*/)
                        print left "=" substr(right, RSTART, RLENGTH) replacement
                        next
                    }
                }
            }
            print
        }
    ' "$file" > "$temp_update"
    cat "$temp_update" > "$file"
    rm -f "$temp_update"
}

# 2. Tự động đoán file cấu hình nếu không khai báo CONFIG_FILE
if [ -z "$CONFIG_FILE" ]; then
    case "$APP_CMD" in
        "goddess_y") CONFIG_FILE="goddess.cfg" ;;
        "bishop_y")  CONFIG_FILE="bishop.cfg" ;;
        "s3relay_y") 
            if [ -f "relay_config.ini" ]; then
                CONFIG_FILE="relay_config.ini"
            else
                CONFIG_FILE="s3relay/relay_config.ini"
            fi
            ;;
        "jx_linux_y") CONFIG_FILE="servercf0.ini" ;;
    esac
fi

# 3. Cập nhật IP vào file cấu hình
if [ -n "$CONFIG_FILE" ] && [ -f "$CONFIG_FILE" ]; then
    echo "-> Updating IP in: $CONFIG_FILE"
    
    # Copy file ra một file tạm trong /tmp để sửa đổi (tránh lỗi mount point busy)
    TEMP_FILE="/tmp/$(basename "$CONFIG_FILE").tmp"
    cp "$CONFIG_FILE" "$TEMP_FILE"
    
    if [[ "$CONFIG_FILE" == *"goddess.cfg"* ]]; then
        update_ini_key "$TEMP_FILE" "Database" "Ip" "$JX_MYSQL_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "IntranetIp" "$JX_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"
        
    elif [[ "$CONFIG_FILE" == *"bishop.cfg"* ]]; then
        update_ini_key "$TEMP_FILE" "Network" "AccSvrIP" "$JX_PAYSYS_IP"
        # bishop_y bind() socket nguồn (kết nối ra Paysys/Role) vào địa chỉ
        # [FixIp] IntranetIp trước khi connect(). Trong Docker Desktop trên
        # Windows, container network_mode: host chạy trong namespace của
        # WSL2, nên IP LAN thật của Windows host ($JX_IP) KHÔNG thể bind
        # được (EADDRNOTAVAIL) -> bishop_y thoát ngay với lỗi
        # "Failed to connect to Paysys". IntranetIp phải là địa chỉ có thể
        # bind được trong container (127.0.0.1); InternetIp vẫn dùng $JX_IP
        # để client LAN kết nối vào bishop.
        update_ini_key "$TEMP_FILE" "FixIp" "IntranetIp" "$JX_IP"
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"
        
    elif [[ "$CONFIG_FILE" == *"relay_config.ini"* ]]; then
        update_ini_key "$TEMP_FILE" "Database" "Ip" "$JX_MYSQL_IP"
        # s3relay_y (CRootClient) bind() socket nguon cua ket noi RootRelay
        # vao dia chi [FixIp] InternetIp truoc khi connect(). Giong bishop,
        # trong Docker Desktop/WSL2 voi network_mode: host, IP LAN thuc cua
        # Windows host ($JX_IP) khong phai dia chi local trong namespace
        # container -> bind() tra EADDRNOTAVAIL -> "RootRelay connect failed"
        # -> s3relay_y exit(0) ngay. Dung 127.0.0.1 de bind() thanh cong
        # (RootRelay tu ket noi vao chinh no qua loopback, hop ly cho setup
        # 1 may chu duy nhat).
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"

    elif [[ "$CONFIG_FILE" == *"servercf0.ini"* ]]; then
        # jx_linux_y bind() socket lang nghe [GameServer] Port truc tiep vao
        # dia chi [FixIp] InternetIp. Giong s3relay/bishop, $JX_IP (IP LAN cua
        # Windows host) khong phai dia chi local trong namespace container
        # (network_mode: host tren Docker Desktop/WSL2) -> bind() tra
        # EADDRNOTAVAIL -> "Failed to open service on port[6666]!" -> exit.
        # Cac service khac (bishop/goddess/s3relay/paysys) cung dung
        # network_mode: host nen deu o chung 1 network namespace; 127.0.0.1
        # la dia chi dung de cac service noi bo ket noi toi GameServer.
        update_ini_key "$TEMP_FILE" "FixIp" "InternetIp" "$JX_IP"
    fi
    
    # Ghi đè nội dung file tạm ngược lại vào file config gốc mà không thay đổi inode (tránh lỗi busy)
    cat "$TEMP_FILE" > "$CONFIG_FILE"
    rm -f "$TEMP_FILE"
else
    echo "-> [Warning] Config file '$CONFIG_FILE' not found or not defined!"
fi

# 4. Khởi chạy
if [ $# -gt 0 ]; then
    exec "$@"
else
    # Tự động tìm kiếm file thực thi trong thư mục hiện tại và các thư mục con (sâu tối đa 3 cấp)
    if [ ! -f "./${APP_CMD}" ]; then
        echo "-> '${APP_CMD}' not found in current directory. Searching in subdirectories..."
        FOUND_PATH=$(find . -maxdepth 3 -type f -name "${APP_CMD}" -print -quit 2>/dev/null)
        if [ -n "$FOUND_PATH" ]; then
            DIR_PATH=$(dirname "$FOUND_PATH")
            echo "-> Found '${APP_CMD}' in '${DIR_PATH}', switching directory..."
            cd "$DIR_PATH"
        else
            # Thử tìm phiên bản không có đuôi _y (fallback)
            ALT_CMD=$(echo "$APP_CMD" | sed 's/_y$//')
            FOUND_ALT_PATH=$(find . -maxdepth 3 -type f -name "$ALT_CMD" -print -quit 2>/dev/null)
            if [ -n "$FOUND_ALT_PATH" ]; then
                DIR_PATH=$(dirname "$FOUND_ALT_PATH")
                echo "-> Found '${ALT_CMD}' in '${DIR_PATH}', switching directory & falling back..."
                cd "$DIR_PATH"
                APP_CMD="$ALT_CMD"
            fi
        fi
    fi

    # Đảm bảo file có quyền thực thi trước khi khởi chạy
    if [ -f "./${APP_CMD}" ]; then
        chmod +x "./${APP_CMD}"
        exec "./${APP_CMD}"
    else
        echo "-> [ERROR] Could not find '${APP_CMD}' anywhere in $(pwd) or its subdirectories!" >&2
        exit 1
    fi
fi
