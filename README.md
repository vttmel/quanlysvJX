# Quan ly server JX

Huong dan nay danh cho nguoi moi, khong can biet nhieu ve IT. Ban chi can cai Docker, tai ma nguon, chay lenh khoi dong, sau do cau hinh va dieu khien server tren giao dien Web.

## Luu y truoc khi cai

- Uu tien chay tren Ubuntu/Linux server.
- Co the chay tren Windows bang Docker Desktop, nhung can lam them buoc cau hinh `MANAGER_PROJECT_ROOT` va bat tinh nang Host networking. Xem muc "Chay tren Windows (Docker Desktop)" o cuoi bai.
- File `.env` da co san trong repo va co the sua tren Web o muc Cai dat. File nay co mat khau mac dinh, can doi truoc khi dung ngoai may ca nhan hoac mang LAN tin cay.
- Web Manager co quyen dieu khien Docker tren may chu. Chi dung trong mang LAN tin cay, khong mo cong ra Internet cong cong.

## 1. Cai Docker

Vao trang chu Docker, tai ban phu hop voi he dieu hanh cua ban va cai dat theo huong dan cua Docker.

Sau khi cai xong, mo Terminal va kiem tra:

```bash
docker --version
docker compose version
```

Neu hai lenh tren hien version, Docker da san sang.

## 2. Tai ma nguon

Mo Terminal, chay:

```bash
git clone https://github.com/hungnt87/quanlysvJX.git
cd quanlysvJX
```

## 3. Kiem tra file cau hinh `.env`

Repo da co file `.env` o thu muc goc. Ban co the tu sua bang text editor (nhu `nano .env`) hoac sua de nhat qua giao dien Web sau khi khoi dong Web Manager (Buoc 4).

**Luu y quan trong:** Vi server thuong chay tren may ao (VM), `localhost` se khong phai la IP dung de truy cap tu may thuc (may host). Ban can phai chay Web Manager len truoc, sau do truy cap bang IP cua may ao.

Cach sua tren giao dien Web:

1. Chay Web Manager o Buoc 4.
2. Vao trinh duyet bang IP cua may ao (vi du: `http://<IP-may-ao>`) hoac `http://localhost` neu dang o trong cung may ao co giao dien do hoa.
3. Mo `Cai dat` -> Chon tab `Bien moi truong (.env)`.
4. Sua cau hinh va bam luu.

Cac muc thuong can quan tam:

- `JX_IP`: IP cua may chay server game trong mang LAN.
- `JX_MYSQL_IP`, `JX_PAYSYS_IP`, `JX_MSSQL_IP`: IP ket noi giua cac dich vu JX.
- `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_DATABASE`: tai khoan database cho Web Manager.
- `BACKUP_SCHEDULER_ENABLED`: bat/tat lich sao luu tu dong.

`SERVER_PATH` se duoc Web tu cap nhat khi ban kich hoat phien ban game, khong can sua tay luc moi cai.

## 4. Khoi dong Web Manager

Tai thu muc goc cua repo, chay:

```bash
docker compose up -d --build
```

Lenh nay se build va chay:

- Giao dien Web o cong `80`

Mo trinh duyet:

- Tren may dang chay server: `http://localhost`
- Tu may khac cung LAN: `http://<IP-may-chu>`

Vi du: `http://192.168.10.4`

## 5. Cai dat va kich hoat phien ban game

Sau khi mo Web, can cai dat phien ban game truoc khi chay service.

1. Vao `Cai dat`.
2. Chon tab `Phien ban game`.
3. Tai len file `.zip`, `.tar.gz`, `.tgz` hoac clone tu GitHub.
4. Chon dung thu muc server neu Web yeu cau.
5. Bam kich hoat phien ban.

Neu chua kich hoat phien ban game, Dashboard se khong cho chay cac dich vu game.

## 6. Cau hinh IP game

Vao `Cai dat` de cau hinh IP game.

- `Game server IP`: chon IP that cua may chu trong mang LAN trong danh sach goi y, hoac tu nhap IP
  (dang IPv4) neu IP do khong co trong danh sach (vi du IP LAN thuc tren Windows).
- Neu muon choi tu ngoai Internet qua VPN, chon/nhap IP VPN cua may chu thay vi IP LAN.
- May choi game cung can ket noi vao cung VPN va truy cap server bang IP VPN nay.
- `MySQL IP`, `Paysys IP`, `MSSQL IP`: thuong de `127.0.0.1` khi chay tat ca tren cung may.

Sau khi luu cau hinh IP, restart cac dich vu dang chay de cau hinh moi co hieu luc.

## 7. Chay va quan ly dich vu JX

Vao `Bang dieu khien`.

Tai day co the:

- Xem trang thai dich vu.
- Chuan bi image neu dich vu chua co image.
- Bat/tat tung dich vu JX.
- Xem log truc tiep khi service dang khoi dong.

Nen khoi dong theo giao dien Web thay vi tu go lenh trong `apps/jx-services`.

## 8. Quan ly tai khoan game

Vao `Tai khoan`.

Tai day co the:

- Tao tai khoan game.
- Doi mat khau.
- Doi mat khau cap 2.
- Gia han tai khoan.
- Khoa/mo khoa tai khoan.
- Xoa mem tai khoan.

Tinh nang nay can MSSQL chay dung va thong tin MSSQL trong `.env` phai chinh xac.

## 9. Sao luu va phuc hoi

Vao `Sao luu`.

Tai day co the:

- Tao ban sao luu thu cong.
- Xem danh sach file sao luu.
- Ghi chu/chinh sua thong tin file sao luu.
- Phuc hoi du lieu tu ban sao luu.
- Cau hinh lich sao luu tu dong.

Sao luu tu dong duoc bat/tat bang `BACKUP_SCHEDULER_ENABLED` trong `.env` va cau hinh chi tiet trong tab sao luu tren Web.

## Loi thuong gap

### Docker chua chay

Neu `docker compose up -d --build` bao loi ket noi Docker, hay mo Docker Desktop hoac khoi dong Docker service tren Linux.

### Khong mo duoc Web

Kiem tra container:

```bash
docker compose ps
```

Neu UI/API chua chay, xem log:

```bash
docker compose logs -f
```

### Web bao chua kich hoat phien ban game

Vao `Cai dat` -> `Phien ban game`, tai len hoac clone phien ban game, sau do kich hoat.

### Khong quan ly duoc tai khoan

Kiem tra MSSQL da chay va thong tin `MSSQL_USER`, `MSSQL_PASSWORD`, `MSSQL_DATABASE` trong `.env` dung.

### Chay tren Windows bi loi

Xem muc "Chay tren Windows (Docker Desktop)" o duoi. Loi thuong gap nhat la chua dien `MANAGER_PROJECT_ROOT` trong `.env`, hoac chua bat Host networking trong Docker Desktop.

### Chay tren macOS

macOS Docker Desktop chua duoc test. Cac van de tuong tu Windows (network_mode: host, duong dan volume) co the xay ra; uu tien chay tren Ubuntu/Linux server.

### code-server bao loi permission denied (EACCES) khi chay lan dau

Loi hien thi trong log:
```
code-server  | error EACCES: permission denied, mkdir '/home/coder/.config/code-server'
```

**Nguyen nhan:**
Docker tu dong tao cac thu muc volume mount tren host duoi quyen `root:root` khi chay lan dau, dan den user non-root trong container khong co quyen ghi.

**Cach khac phuc:**
Du an da duoc cap nhat de mac dinh chay `code-server` duoi quyen root (`user: "0:0"`) trong `docker-compose.yaml` nham tu dong giai quyet loi nay. Neu ban su dung phien ban cu, hay bo sung dong `user: "0:0"` vao duoi service `code-server` trong file `docker-compose.yaml`.

## Chay tren Windows (Docker Desktop)

Du an co the chay tren Windows bang Docker Desktop (WSL2 backend), nhung can cau hinh them 2 muc duoi day.

### 1. Bat Host networking trong Docker Desktop

Manager (api/ui) va toan bo dich vu JX trong `apps/jx-services` deu dung `network_mode: host` de bind dung IP LAN cua may. Tren Windows, tinh nang nay can duoc bat thu cong:

- Mo Docker Desktop -> `Settings` -> `Resources` -> `Network`.
- Bat `Enable host networking` (yeu cau Docker Desktop ban moi, tu khoang 4.34 tro len).
- Ap dung va khoi dong lai Docker Desktop.

Can Docker Desktop >= 4.34. Neu khong thay tuy chon nay, hay cap nhat Docker Desktop len ban moi nhat.

### 2. Khai bao `MANAGER_PROJECT_ROOT` trong `.env`

API container goi `docker compose` (qua Docker socket mount) de dieu khien cac service trong `apps/jx-services` tren chinh Docker host. Vi vay gia tri `MANAGER_PROJECT_ROOT` phai la duong dan **theo goc nhin cua Docker Desktop daemon**, khong phai duong dan Windows binh thuong (`C:\...`).

Docker Desktop mount cac o dia Windows vao duong dan noi bo dang:

```
/run/desktop/mnt/host/<o dia viet thuong>/<duong dan, dung dau />
```

Vi du, neu repo nam o `C:\Users\Admin\Documents\GitHub\quanlysvJX`, mo file `.env` o thu muc goc repo va dien:

```
MANAGER_PROJECT_ROOT=/run/desktop/mnt/host/c/Users/Admin/Documents/GitHub/quanlysvJX
```

Sau do chay binh thuong tu PowerShell tai thu muc goc repo:

```powershell
docker compose up -d --build
```

Khong can dat bien moi truong `MANAGER_PROJECT_ROOT` truoc lenh nhu tren Linux (vi `$PWD` khong ton tai trong PowerShell/cmd) - gia tri trong `.env` se duoc dung truc tiep.

### Luu y khi chay tren Windows

- Tinh nang tu nhan dien IP (trong `Cai dat` -> Game server IP) co the chi goi y IP noi bo cua may ao Docker Desktop (vi du `192.168.65.x`), khong phai IP LAN thuc cua Windows. O o `Game server IP`, hay tu nhap (go truc tiep) IP LAN thuc cua may Windows (xem bang `ipconfig`, thuong dang `192.168.x.x`) roi bam Luu cau hinh IP.
- Gio hien thi trong container duoc dat ve `Asia/Ho_Chi_Minh` qua bien `TZ` (xem `docker-compose.yaml`), khong phu thuoc `/etc/timezone` cua may Windows.
- Cac container game (Wine/CentOS) van la container Linux, build va chay binh thuong trong VM Linux cua Docker Desktop; van de chinh nam o networking (muc 1) chu khong phai build.

## Bao mat

Du an hien phu hop dung trong LAN/noi bo. Khong public Web Manager ra Internet khi chua co dang nhap, phan quyen, HTTPS va cau hinh firewall phu hop.
