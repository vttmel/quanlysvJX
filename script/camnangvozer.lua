IncludeLib("ITEM")
IncludeLib("NPCINFO")
IncludeLib("RELAYLADDER")
IncludeLib("FILESYS")
IncludeLib("TASKSYS")
IncludeLib("SETTING")
IncludeLib("TIMER") 
IncludeLib("BATTLE")
IncludeLib("TITLE")
Include("\\script\\lib\\remoteexc.lua")
Include("\\script\\gm_tool\\dispose_item.lua");
Include("\\script\\global\\pgaming\\configserver\\configall.lua")
Include("\\script\\global\\mel\\feature\\vozertest.lua")
Include("\\script\\global\\pgaming\\trangbixanh\\tuychontrangbixanh.lua")
Include("\\script\\global\\pgaming\\doivukhixanh\\makeitemblue.lua")
Include("\\script\\task\\metempsychosis\\task_func.lua")

----------------------------------------------------------------------------------------------------
--											CÈm Nang Vozer								  		  --
----------------------------------------------------------------------------------------------------

THONGTINSERVER_DIALOG = "Sè l­îng tµi kho¶n online: <color=green>%s<color>\n"
TITLE_DIALOG = "Tªn nh©n vËt: <color=green>%s<color> "
TITLE_DIALOG  = TITLE_DIALOG.."-- TTK: <color=gold>%s<color>/<color=green>%s<color>, VLMT: <color=gold>%s<color>/<color=green>%s<color>\n"
DOCHI_DIALOG = "ThÇn BÝ §å ChÝ: <color=green>%s<color>\n"
DIEMTK_DIALOG = "§iÓm tÝch lòy Tèng Kim: <color=green>%s<color>\n"
DATAU_DIALOG = "NhiÖm vô D· TÈu ®· hoµn thµnh: <color=green>%s<color>\n"
BOSS_SATTHU_DIALOG = "NhiÖm vô Boss S¸t Thñ: <color=gold>%s<color>/<color=green>%s<color>\n"
THONGTINNHANVAT_DIALOG = "ChØ sè May m¾n: <color=green>%s<color> / §iÓm Vinh Dù: <color=green>%s<color>"

function main(nItemIndex)
	dofile("script/global/mel/item/camnangvozer.lua")
	dofile("/script/global/pgaming/doivukhixanh/makeitemblue.lua")
		local strFaction = GetFaction()
		local nW,nX,nY = GetWorldPos();
		local year = tonumber(date( "%y"))
		local mm = tonumber(date( "%m"))
	local day = tonumber(date( "%d"))
	local hour = tonumber(GetLocalDate("%H"))
	local mmin = tonumber(GetLocalDate("%M"))
	local nDate = tonumber(GetLocalDate("%y%m%d"));	
	local nDochi = GetTask(1027)
	local myDateBossST = GetTask(1192);
	local nTTK = GetTask(81);
	local nVLMT = GetTask(80);
	if myDateBossST ~= nDate then
		SetTask(1193, 0);
		SetTask(1192, nDate);
	end
	local nBossST = GetTask(1193)
	local nDiemTK = GetTask(747)
	local nDaTau = GetTask(1044)
	local nVinhDu = GetTask(2501)
	local szThongTin = format(THONGTINSERVER_DIALOG, GetPlayerCount());
	szThongTin = szThongTin..format(TITLE_DIALOG, GetName(), nTTK, GioiHanTTK, nVLMT, GioiHanVLMT);
	szThongTin = szThongTin..format(DOCHI_DIALOG, nDochi);
	szThongTin = szThongTin..format(BOSS_SATTHU_DIALOG, nBossST,SoLuongBossSatThuTrongNgay);
	szThongTin = szThongTin..format(DIEMTK_DIALOG, nDiemTK);
	szThongTin = szThongTin..format(DATAU_DIALOG, nDaTau);
	szThongTin = szThongTin..format(THONGTINNHANVAT_DIALOG, GetLucky(0), nVinhDu);
	local tbSay = {szThongTin};

		-- if VozerTest == 1 then
            tinsert(tbSay,"Test Server/vozertest");
        -- end
		tinsert(tbSay,"Test TK/testtk");
		tinsert(tbSay,"Test nhan do/testnhando");
		tinsert(tbSay,"Nhan vat pham test/GiveLak");
		tinsert(tbSay,"add khang/addkhang");
		tinsert(tbSay,"Add skill/addskill");
		tinsert(tbSay,"dell skill/dellskill");
		tinsert(tbSay,"Phi ChiÕn §Êu/phichiendau");
		--tinsert(tbSay,"T¹o b·i qu¸i/meltaobai");
		--tinsert(tbSay,"Xãa b·i qu¸i/melxoabai");
		tinsert(tbSay,"Gi¶i KÑt Nh©n VËt/KetAcc");
		tinsert(tbSay,"Söa ThÇn Hµnh Phï/FixTHP");
		tinsert(tbSay,"Hñy VËt PhÈm/DisposeItem");
		tinsert(tbSay,"KÕt thóc ®èi tho¹i./no")

		CreateTaskSay(tbSay)
	return 1;
end
tbListSkill = {
	[491]={Level =1, name="Lenh bai"},
	[492]={Level =10, name="chien co"},
}
function addskill()
	--DoClearSkillCore()
	local nIdSkill = 586 -- tang chi mang
	local nIdSkill = 75 -- Ngu doc ky kinh
	local nLevelSkill = 40
	AddMagic(nIdSkill, nLevelSkill);
	-- for nId, setting in pairs(tbListSkill) do
	-- 	if (HaveMagic(nId) ~= -1) then
	-- 		DelMagic(nId)
	-- 	end
	-- 	AddMagic(nId, setting.Level);
	-- 	Msg2Player("<color=green>B¹n ®· häc thµnh c«ng kü n¨ng  "..setting.name.." råi");
	-- end

end
function dellskill()
	-- for nId, setting in ipairs(tbListSkill) do
	-- 	if (HaveMagic(nId) ~= -1) then
	-- 		DelMagic(nId)
	-- 		Msg2Player("<color=green>B¹n ®· x¸a thµnh c«ng kü n¨ng  "..setting.name.." råi");
	-- 	end
	--end
	--DelMagic(490)
	DelMagic(75)
end
function testtk()
    local level = 3
    RemoteExc("\\script\\simcity.lua", "Mo_TongKim", {3})
end
function addkhang()
	-- for i=0,4 do
	-- 	AddMaxResist(i,-5)
	-- end
	--AddMagicPoint(200)
	local nTime = 18*60*60*60*60
    --zhuansheng_clear_skill(0, 0)
	--RollbackSkill()    
	-- -- AddSkillState( 471,0,0,nTime,0)
	-- AddSkillState( 473, 1, 0,nTime,0)--kh¸ng vl
	-- AddSkillState( 474, 1, 0,nTime,0)--kh¸ng ®éc
	-- AddSkillState( 475, 1, 0,nTime,0) --kh¸ng b¨ng	
	-- AddSkillState( 476, 1, 0,nTime,0)-- kh¶ng háa
	-- AddSkillState( 477, 1, 0,nTime,0) -- kh¸ng l«i
	--RemoveSkillState( 496)
	-- RemoveSkillState( 473)--kh¸ng vl
	-- RemoveSkillState( 474)--kh¸ng ®éc
	-- RemoveSkillState( 475) --kh¸ng b¨ng	
	-- RemoveSkillState( 476)-- kh¶ng háa
	-- RemoveSkillState( 477) -- kh¸ng l«i
	--AddSkillState( 493, 3, 1,nTime,1) --tèc ch¹y
	--RemoveSkillState(484)
	AddSkillState(464, 10, 1, nTime,1) -- hoi sinh luc
	AddSkillState(465, 5, 1, nTime,1)
	--AddSkillState(484, 10, 1, nTime,1) -- stvl
	--AddSkillState(293, 10, 1, nTime,1) -- Mi?n dich
	AddSkillState(75, 30, 1, nTime,1) -- Ngu doc ky kinh
	AddSkillState(586, 40, 1, nTime,1) -- tang chi mang
	--KickOutSelf()

end
function testnhando()
	print("test")
	
	-- C?u hình các option c?n tìm (d? dàng thêm/b?t)
	local tbRequiredOptions = {
		--{magictype = 136, minValue = 5, name = "Hut sinh luc"},  -- Option 1
		{magictype = 139, minValue = 1, name = "+ skill"},  -- Option 3
		--{magictype = 115, minValue = 30, name = "tdd"},
		--{magictype = 116, minValue = 20, name = "tdd nc"},
		--{magictype = 121, minValue = 30, name = "stvl"}, --- Option 2
		--{magictype = 126, minValue = 50, name = "%stvl"},
		--{magictype = 125, minValue = 50, name = "doc sat ngoai cong"},
		--{magictype = 172, minValue = 50, name = "doc sat noi cong"},
		--{magictype = 170, minValue = 200, name = "hs nc"},--- Option 2
		-- {magictype = 116, minValue = 30, name = "Chí m?ng"},
		--{magictype = 85, minValue = 180, name = "sinh luc"},
		--{magictype = 92, minValue = 20, name = "phuc hoi noi luc"},
		--{magictype = 113, minValue = 40, name = "tg phuc hoi"},
		--{magictype = 101, minValue = 25, name = "khang doc"},
		--{magictype = 103, minValue = 30, name = "khang loi"},
		--{magictype = 102, minValue = 20, name = "khang hoa"},
		--{magictype = 114, minValue = 20, name = "ktc"},
			--{magictype = 110, minValue = 25, name = "tg lam choang"},
		--{magictype = 104, minValue = 25, name = "ptvl"},
		--{magictype = 105, minValue = 25, name = "khang bang"},
		--{magictype = 106, minValue = 25, name = "tg lam cham"},
		--{magictype = 111, minValue = 40, name = "toc do di chuyen"},
		--{magictype = 134, minValue = 10, name = "chstnl"},
		--{magictype = 136, minValue = 5, name = "hut sl"},
	}
	
	-- C?u hình item
	local nCount = 0
	local nItemGenre = 0
	local nDetailType = 3
	local nParticularType = 0
	local nLevel = 10
	local nSeries = 3
	local nLuck = 250
	local nItemLevel = 10
	local nMaxTries = 6000
	
	-- B?t ??u t?o item
	for i = 1, nMaxTries do
		xItem = AddVerItem(4, random(10, 99999999), nItemGenre, nDetailType, nParticularType, nLevel, nSeries, 250, 10)
		
		-- Ki?m tra t?t c? các option yêu c?u
		local tbFoundOptions = {}
		for j = 1, 5 do
			local magictype, p1 = GetItemMagicAttrib(xItem, j)
			
			-- Ki?m tra xem magic này có n?m trong danh sách yêu c?u không
			for k = 1, getn(tbRequiredOptions) do
				local reqOption = tbRequiredOptions[k]
				if magictype == reqOption.magictype and p1 >= reqOption.minValue then
					tbFoundOptions[k] = {magictype = magictype, value = p1, name = reqOption.name}
					--print("Found option: "..reqOption.name.." with value "..p1)
				end
			end
		end
		
		-- Ki?m tra xem ?ã ?? t?t c? các option yêu c?u ch?a
		local bAllOptionsFound = 1
		for k = 1, getn(tbRequiredOptions) do
			if not tbFoundOptions[k] then
				bAllOptionsFound = 0
				break
			end
		end
		
		-- N?u tìm th?y ?? t?t c? option
		if bAllOptionsFound == 1 then
			print("=== DA TIM THAY DO VIP SAU "..nCount.." LAN TAO ===")
			for k = 1, getn(tbRequiredOptions) do
				local opt = tbFoundOptions[k]
				print("  + "..opt.name..": magictype="..opt.magictype..", value="..opt.value)
			end
			break		
		else
			RemoveItemByIndex(xItem)
		end
		
		nCount = nCount + 1
	end
	
	if nCount >= nMaxTries then
		print("KHONG TIM THAY SAU "..nMaxTries.." LAN THU")
	end
	print("end")
end
function GiveLak()
	--AddStackItem(18,1,303,1,nil,1000000);
	--AddStackItem(50,6,1,156,1,0,0); -- chien co
	-- --AddStackItem(50,6,1,157,1,0,0);
	-- for i =1,10 do
	--AddStackItem(50,6,1,156,1,0,0); -- chien co
	--AddStackItem(50,6,1,157,1,0,0); -- lenh bai
	-- end
	-- for i =1,6 do
	-- 	AddStackItem(50,6,1,178,1,0,0); --ngoai pho hoan
	-- 	AddStackItem(50,6,1,179,1,0,0);
	-- 	AddStackItem(50,6,1,180,1,0,0);
	-- end
	-- AddStackItem(5,6,1,4911,1,0,0);
	-- AddStackItem(1,6,1,4924,1,0,0);
	AddStackItem(1,6,1,2424,1,0,0) --dai thanh 90
	-- AddStackItem(1,6,1,2425,1,0,0) --dai thanh 120
	-- AddStackItem(1,6,1,4922,1,0,0) --dai thanh 120
	-- for i =1,5 do
	-- 	AddStackItem(50,6,1,181,1,0,0);
	-- 	AddStackItem(50,6,1,182,1,0,0);
	-- 	AddStackItem(50,6,1,183,1,0,0);
	-- 	AddStackItem(50,6,1,184,1,0,0);
	-- 	AddStackItem(50,6,1,185,1,0,0);
	-- end
	-- for i = 1,8 do
	--AddStackItem(50,6,1,187,1,0,0); --toc chay
	--AddStackItem(50,6,1,190,1,0,0); --Phi toc
	-- end
	-- AddStackItem(50,6,1,4925,1,0,0); --cuong bao don
	-- AddStackItem(50,6,1,4931,1,0,0);
	-- AddStackItem(50,6,1,4932,1,0,0);
	-- AddStackItem(50,6,1,4933,1,0,0);
	-- AddStackItem(50,6,1,4934,1,0,0);
	-- AddStackItem(50,6,1,4935,1,0,0);
	--AddStackItem(999,6,1,4905,1,0,0); --vo lam lenh
	--AddStackItem(8,6,1,12,1,0,0);
	
end
----------------------------------------------------------------------------------------------------
--										  		 Mua M¸u							  		  	  --
----------------------------------------------------------------------------------------------------
function muamau()
local totalcount =CalcFreeItemCellCount();
	AskClientForNumber("muamau1",0,totalcount, "3000/1: ")
end

function muamau1(n_key)
if n_key*3000 > GetCash() then
		Talk(1,"","Kh«ng ®ñ ng©n l­îng")
		return 1
end 

	for k=1,n_key do 		
	AddItem(1,2,0,5,0,0,0);
	Pay(3000)
	end
end

function muamaufull()
local nJxb = 240000
if GetCash() < nJxb then
	Msg2Player(format("CÇn Ýt nhÊt 18 v¹n trong r­¬ng",nJxb))
	return
end
	local totalcount =CalcFreeItemCellCount();
	if totalcount == 0 then 
        Say("<color=yellow>§¹i hiÖp ®· cã ®Çy r­¬ng m¸u.",0)
		return
	end	
	for k=1,totalcount do 		
	AddItem(1,2,0,5,0,0,0);
	Pay(3000)
	end
end

----------------------------------------------------------------------------------------------------
--										  	 Phi ChiÕn §Êu								  		  --
----------------------------------------------------------------------------------------------------
function phichiendau()
SetFightState(0); 
end

----------------------------------------------------------------------------------------------------
--										  	 T¹o b·i qu¸i								  		  --
----------------------------------------------------------------------------------------------------
function meltaobai()
local tbNpcList = GetAroundNpcList(60)
local pW, pX, pY = GetWorldPos()
local tmpFound = {}
local nNpcIdx
for i=1,getn(tbNpcList) do
nNpcIdx = tbNpcList[i]
local nSettingIdx = GetNpcSettingIdx(nNpcIdx)
local name = GetNpcName(nNpcIdx)
local level = NPCINFO_GetLevel(nNpcIdx)
local kind = GetNpcKind(nNpcIdx)
if nSettingIdx > 0 and kind == 0 then
tinsert(tmpFound, {nSettingIdx, name, level})
end
end
local total = getn(tmpFound)
if total == 0 then
return 0
end
local j = 0
while j < 20 do
local data = tmpFound[random(1, total)]
local isBoss = 0
if (j==10) then
isBoss = 2
end
local nNpcIndex = AddNpcEx(data[1], data[3], random(0,4), SubWorldID2Idx(pW),(pX + random(-5,5)) * 32, (pY + random(-5,5)) * 32, 0, data[2] , isBoss)
if nNpcIndex > 0 then
j = j + 1
end
end
return 0
end

----------------------------------------------------------------------------------------------------
--										  	Xãa b·i qu¸i								  		  --
----------------------------------------------------------------------------------------------------
function melxoabai()
    local tbNpcList = GetAroundNpcList(30)
    local pW, pX, pY = GetWorldPos()
    local tmpFound = {}
    local nNpcIdx
    for i=1,getn(tbNpcList) do
        nNpcIdx = tbNpcList[i]
        local kind = GetNpcKind(nNpcIdx)


        local nSettingIdx = GetNpcSettingIdx(nNpcIdx)

        local nNpcType = GetNpcPowerType(nNpcIdx)

        if nSettingIdx > 0 and kind == 0 and nNpcType ~= 3 then
            DelNpc(nNpcIdx)
        end
    end
    return 0
end

----------------------------------------------------------------------------------------------------
--										  Gi¶i kÑt nh©n vËt								  		  --
----------------------------------------------------------------------------------------------------
function KetAcc()
	Say("B¹n cã ch¾c ch¾n r»ng b¹n ®ang bÞ kÑt acc kh«ng?", 2, "§óng vËy!/GiaiKetNhanVat", "Ta nhÇm./no")
end

function GiaiKetNhanVat()
	local nW, nX, nY = GetWorldPos();
	for i=235,248 do
		if (nW == i) then
		Msg2Player("Map nµy kh«ng thÓ sö dông tÝnh n¨ng nµy!")
		return 1
		end
	end
	if (nW == 53) then
		SetPos(1626,3179);
	else
		NewWorld(53, 1626, 3179);
	end
	SetFightState(0);
	Msg2Player("Gi¶i kÑt nh©n vËt thµnh c«ng!")
end

function FixTHP()
	DisabledUseTownP(0)
end