const NURSE_PASSWORD = "1234"; 
const SUPABASE_URL = 'https://gmgsthzchdudeuarcprc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tb8NDpc1ulRIvmJuAqSJwQ_EyxqC8SN';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let allPatientsData = [];
let globalRecords = [];

const thaiMonths = {
    "01": "มกราคม", "02": "กุมภาพันธ์", "03": "มีนาคม", "04": "เมษายน",
    "05": "พฤษภาคม", "06": "มิถุนายน", "07": "กรกฎาคม", "08": "สิงหาคม",
    "09": "กันยายน", "10": "ตุลาคม", "11": "พฤศจิกายน", "12": "ธันวาคม"
};

window.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('selectVillage')) {
        initAsomPage();
    }
    if (document.getElementById('dataTableBody')) {
        checkNurseAccessOnLoad();
    }
});

// ดึงค่ารอบเดือนปัจจุบันจากฐานข้อมูลกลาง (Supabase)
async function getActiveMonthYear() {
    try {
        let { data, error } = await supabaseClient
            .from('system_settings')
            .select('value')
            .eq('key', 'active_health_month')
            .single();

        if (!error && data) {
            return data.value;
        }
    } catch (err) {
        console.error("Error fetching active month:", err);
    }
    return '2026-09'; // ค่าสำรองเริ่มต้น
}

// เริ่มต้นหน้าจอ อสม. พร้อมผูกระบบ Real-time คอยฟังการเปลี่ยนเดือนจากพยาบาล
async function initAsomPage() {
    await loadAndRenderActiveMonth();

    // ติดตั้งระบบดักฟังการเปลี่ยนรอบเดือนแบบ Real-time
    try {
        supabaseClient
            .channel('public:system_settings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'system_settings', filter: 'key=eq.active_health_month' }, payload => {
                console.log('🔄 ตรวจพบการเปลี่ยนรอบเดือนจากพยาบาล:', payload.new.value);
                loadAndRenderActiveMonth(); // รีเฟรชข้อมูลและหน้าจอ อสม. ทันทีอัตโนมัติ
            })
            .subscribe();
    } catch (e) {
        console.error("Realtime subscription error:", e);
    }
}

async function loadAndRenderActiveMonth() {
    const active = await getActiveMonthYear(); 
    const [y, m] = active.split('-');
    
    const displayEl = document.getElementById('activeMonthDisplay');
    if (displayEl) {
        displayEl.innerText = `${thaiMonths[m] || m} ค.ศ. ${y} (พ.ศ. ${parseInt(y)+543})`;
    }

    await fetchPatientsMasterData(active);
}

async function fetchPatientsMasterData(monthYear) {
    const villageSelect = document.getElementById('selectVillage');
    const patientSelect = document.getElementById('selectPatient');
    
    if (villageSelect) villageSelect.innerHTML = '<option value="" disabled selected>-- กำลังโหลดข้อมูลหมู่... --</option>';
    if (patientSelect) {
        patientSelect.innerHTML = '<option value="" disabled selected>-- กรุณาเลือกหมู่ก่อน --</option>';
        patientSelect.disabled = true;
    }

    try {
        let { data, error } = await supabaseClient
            .from('health_records')
            .select('id_card, fullname, house_no, village_no, subdistrict, age')
            .eq('month_year', monthYear);

        if (!error && data) {
            allPatientsData = data;
        } else {
            allPatientsData = [];
        }

        populateVillageDropdown();
    } catch (err) {
        console.error('Connection error:', err);
        allPatientsData = [];
        populateVillageDropdown();
    }
}

function populateVillageDropdown() {
    const villageSelect = document.getElementById('selectVillage');
    if (!villageSelect) return;
    
    villageSelect.innerHTML = '<option value="" disabled selected>-- เลือกหมู่ที่ --</option>';

    const villages = [...new Set(allPatientsData.map(p => p.village_no))]
        .filter(v => v !== null && v !== undefined && v !== '' && !isNaN(v));

    villages.sort((a, b) => parseInt(a) - parseInt(b));

    if (villages.length === 0) {
        villageSelect.innerHTML = '<option value="" disabled selected>-- ยังไม่มีข้อมูลหมู่ (กรุณานำเข้า Excel ก่อน) --</option>';
        return;
    }

    villages.forEach(v => {
        let opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `หมู่ ${v}`;
        villageSelect.appendChild(opt);
    });
}

function filterPatientsByVillage() {
    const selectedVillage = document.getElementById('selectVillage').value;
    const patientSelect = document.getElementById('selectPatient');
    if (!patientSelect) return;

    patientSelect.innerHTML = '<option value="" disabled selected>-- เลือกชื่อ - นามสกุล --</option>';
    clearAutoFillFields();
    
    if (!selectedVillage) {
        patientSelect.disabled = true;
        return;
    }

    const filtered = allPatientsData.filter(p => String(p.village_no) === String(selectedVillage));
    filtered.forEach(p => {
        let opt = document.createElement('option');
        opt.value = p.id_card;
        opt.textContent = p.fullname;
        patientSelect.appendChild(opt);
    });

    patientSelect.disabled = false;
}

function autoFillPatientData() {
    const selectedIdCard = document.getElementById('selectPatient').value;
    if (!selectedIdCard) { clearAutoFillFields(); return; }

    const patient = allPatientsData.find(p => p.id_card === selectedIdCard);
    if (patient) {
        document.getElementById('idCard').value = patient.id_card || '';
        document.getElementById('age').value = patient.age || '';
        document.getElementById('houseNo').value = patient.house_no || '';
        
        let villageNoText = patient.village_no ? `ม.${patient.village_no}` : '';
        let subText = patient.subdistrict ? `ต.${String(patient.subdistrict).replace(/^ต\.?\s*/i, '')}` : 'ต. (ไม่ระบุ)';
        document.getElementById('villageAndSubdistrict').value = `${villageNoText} ${subText}`.trim();
    }
}

function clearAutoFillFields() {
    if(document.getElementById('idCard')) document.getElementById('idCard').value = '';
    if(document.getElementById('age')) document.getElementById('age').value = '';
    if(document.getElementById('houseNo')) document.getElementById('houseNo').value = '';
    if(document.getElementById('villageAndSubdistrict')) document.getElementById('villageAndSubdistrict').value = '';
}

async function saveData(e) {
    e.preventDefault();
    const villageSelect = document.getElementById('selectVillage');
    const patientSelect = document.getElementById('selectPatient');
    
    if (!villageSelect.value || !patientSelect.value) {
        alert('กรุณาเลือกหมู่ที่ และเลือกชื่อ - นามสกุลให้เรียบร้อย');
        return;
    }

    const patient = allPatientsData.find(p => p.id_card === patientSelect.value);
    const btn = document.getElementById('btnSubmit');
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'กำลังบันทึก...';
    }

    const activeMonthYear = await getActiveMonthYear(); 

    const formData = {
        hosp_code: '10701',
        id_card: patient.id_card,
        fullname: patient.fullname,
        age: patient.age ? parseInt(patient.age) : null,
        house_no: patient.house_no,
        village_no: patient.village_no ? parseInt(patient.village_no) : null,
        subdistrict: patient.subdistrict || '',
        weight: document.getElementById('weight').value ? parseFloat(document.getElementById('weight').value) : null,
        height: document.getElementById('height').value ? parseFloat(document.getElementById('height').value) : null,
        bp1: document.getElementById('bp1').value,
        bp2: document.getElementById('bp2').value,
        pulse: document.getElementById('pulse').value ? parseInt(document.getElementById('pulse').value) : null,
        fbs: document.getElementById('fbs').value,
        smoking: document.getElementById('smoking').value,
        drinking: document.getElementById('drinking').value,
        month_year: activeMonthYear
    };

    const { error } = await supabaseClient
        .from('health_records')
        .upsert([formData], { onConflict: 'id_card, month_year' });

    if (btn) {
        btn.disabled = false;
        btn.innerText = '💾 บันทึกข้อมูลเข้า Cloud';
    }

    if (error) {
        alert('เกิดข้อผิดพลาด: ' + error.message);
    } else {
        alert(`✅ บันทึกข้อมูลรอบเดือน ${activeMonthYear} สำเร็จ!`);
        document.getElementById('healthForm').reset();
        clearAutoFillFields();
    }
}

// ---------------- โซนพยาบาล ----------------
function checkNurseAccessOnLoad() {
    const passwordInput = prompt("🔒 กรุณากรอกรหัสผ่านเข้าโซนพยาบาล:");
    if (passwordInput === NURSE_PASSWORD) {
        alert("เข้าสู่ระบบโซนพยาบาลสำเร็จ!");
        getActiveMonthYear().then(active => {
            const [y, m] = active.split('-');
            if(document.getElementById('selectConfigMonth')) document.getElementById('selectConfigMonth').value = m;
            if(document.getElementById('selectConfigYear')) document.getElementById('selectConfigYear').value = y;
            if(document.getElementById('selectViewMonth')) document.getElementById('selectViewMonth').value = m;
            if(document.getElementById('selectViewYear')) document.getElementById('selectViewYear').value = y;
            loadData();
        });
    } else {
        alert("❌ รหัสผ่านไม่ถูกต้อง!");
        window.location.href = "asom.html";
    }
}

// บันทึกเปลี่ยนรอบเดือนลงตารางกลาง เพื่อสั่งรีเฟรชทุกเครื่องแบบ Real-time
async function saveActiveMonthConfig() {
    const m = document.getElementById('selectConfigMonth').value;
    const y = document.getElementById('selectConfigYear').value;
    const newMonthYear = `${y}-${m}`;

    try {
        const { error } = await supabaseClient
            .from('system_settings')
            .upsert({ key: 'active_health_month', value: newMonthYear, updated_at: new Date() });

        if (error) throw error;

        alert(`✅ เปลี่ยนรอบเดือนให้ อสม. ทุกเครื่องเป็น "${thaiMonths[m]} ค.ศ. ${y}" เรียบร้อยแล้ว!`);
    } catch (err) {
        alert(`❌ บันทึกไม่สำเร็จ: ${err.message}`);
    }
}

function lockNurseSession() {
    window.location.href = "asom.html";
}

function openNurseAddModal() { document.getElementById('nurseAddModal').classList.remove('hidden'); }
function closeNurseAddModal() { document.getElementById('nurseAddModal').classList.add('hidden'); }

async function saveNurseNewPatient() {
    const fullname = document.getElementById('nurseAddFullname').value.trim();
    const idCard = document.getElementById('nurseAddIdCard').value.trim();
    const houseNo = document.getElementById('nurseAddHouseNo').value.trim();
    const villageNo = document.getElementById('nurseAddVillageNo').value;
    const currentMonthYear = `${document.getElementById('selectViewYear').value}-${document.getElementById('selectViewMonth').value}`;

    if (!fullname || !idCard || !houseNo || !villageNo) {
        alert('กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }

    const { error } = await supabaseClient.from('health_records').upsert([{
        hosp_code: '10701',
        id_card: idCard,
        fullname: fullname,
        age: document.getElementById('nurseAddAge').value ? parseInt(document.getElementById('nurseAddAge').value) : null,
        house_no: houseNo,
        village_no: parseInt(villageNo),
        month_year: currentMonthYear
    }], { onConflict: 'id_card, month_year' });

    if (error) {
        alert('บันทึกไม่สำเร็จ: ' + error.message);
    } else {
        alert('✅ บันทึกสำเร็จ!');
        closeNurseAddModal();
        loadData();
    }
}

async function loadData() {
    const targetMonthYear = `${document.getElementById('selectViewYear').value}-${document.getElementById('selectViewMonth').value}`;

    const { data, error } = await supabaseClient
        .from('health_records')
        .select('*')
        .eq('month_year', targetMonthYear)
        .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }

    globalRecords = (data || []).map(item => ({
        ...item,
        underlying_diseases: item.diseases || item.underlying_diseases || '-',
        see_doctor: item.see_doctor || item.doctor_visit || '-'
    }));

    updateFilterVillageDropdown(globalRecords);
    renderTable(globalRecords);
}

function updateFilterVillageDropdown(records) {
    const filterSelect = document.getElementById('selectFilterVillage');
    if (!filterSelect) return;
    
    const currentVal = filterSelect.value;
    const villages = [...new Set(records.map(r => r.village_no))].filter(v => v !== null && !isNaN(v));
    villages.sort((a, b) => a - b);

    filterSelect.innerHTML = '<option value="">🏠 ทุกหมู่บ้าน</option>';
    villages.forEach(v => {
        let opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `🏠 หมู่ ${v}`;
        if (String(v) === currentVal) opt.selected = true;
        filterSelect.appendChild(opt);
    });
}

function renderTable(records) {
    const tbody = document.getElementById('dataTableBody');
    if (!tbody) return;

    const countText = document.getElementById('recordCountText');
    if (countText) countText.innerText = `แสดงข้อมูลทั้งหมด ${records.length} รายการ`;

    if (records.length === 0) {
        tbody.innerHTML = `<tr><td colspan="16" class="text-center py-6 text-slate-400">ยังไม่มีข้อมูลในระบบสำหรับเดือนนี้</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    records.forEach((item, index) => {
        let subText = item.subdistrict ? `ต.${item.subdistrict.replace(/^ต\.?\s*/i, '')}` : '';
        let addressDisplay = `ม.${item.village_no || '-'} ${subText}<br>บ้านเลขที่ ${item.house_no || '-'}`.trim();

        tbody.innerHTML += `
            <tr class="hover:bg-slate-50 transition">
                <td class="p-3 font-medium">${index + 1}</td>
                <td class="p-3">${item.id_card || '-'}</td>
                <td class="p-3 font-semibold text-slate-800">${item.fullname || '-'}</td>
                <td class="p-3">${item.age || '-'}</td>
                <td class="p-3">${addressDisplay}</td>
                <td class="p-3">${item.weight || '-'}กก. / ${item.height || '-'}ซม.</td>
                <td class="p-3">${item.bp1 || '-'}</td>
                <td class="p-3">${item.bp2 || '-'}</td>
                <td class="p-3">${item.pulse || '-'}</td>
                <td class="p-3">${item.fbs || '-'}</td>
                <td class="p-3 text-blue-600 font-medium">${item.next_appointment_date || '-'}</td>
                <td class="p-3 text-slate-600">${item.doctor_note || '-'}</td>
                <td class="p-3 text-slate-700">${item.underlying_diseases || '-'}</td>
                <td class="p-3 text-center">${item.appoint_status || '-'}</td>
                <td class="p-3 text-center">${item.see_doctor || '-'}</td>
                <td class="p-3 text-center whitespace-nowrap">
                    <button onclick="openEditModal(${item.id})" class="text-yellow-600 bg-yellow-50 hover:bg-yellow-100 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer">แก้ไข</button>
                    <button onclick="deleteRecord(${item.id})" class="text-red-500 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg text-xs ml-1 cursor-pointer">ลบ</button>
                </td>
            </tr>
        `;
    });
}

function filterTableByPid() {
    const keyword = document.getElementById('searchPidInput').value.trim().toLowerCase();
    const selectedVillage = document.getElementById('selectFilterVillage').value;

    const filtered = globalRecords.filter(item => {
        const matchKeyword = String(item.id_card || '').toLowerCase().includes(keyword) || 
                             String(item.fullname || '').toLowerCase().includes(keyword);
        const matchVillage = selectedVillage === "" || String(item.village_no) === String(selectedVillage);
        return matchKeyword && matchVillage;
    });

    renderTable(filtered);
}

async function deleteRecord(id) {
    if (!confirm('ต้องการลบข้อมูลนี้ใช่หรือไม่?')) return;
    const { error } = await supabaseClient.from('health_records').delete().eq('id', id);
    if (!error) loadData();
    else alert('ลบไม่สำเร็จ: ' + error.message);
}

function openEditModal(id) {
    const record = globalRecords.find(r => Number(r.id) === Number(id));
    if (!record) return;
    document.getElementById('editRecordId').value = record.id;
    document.getElementById('editFullname').value = record.fullname || '';
    document.getElementById('editIdCard').value = record.id_card || '';
    document.getElementById('editAge').value = record.age || '';
    document.getElementById('editWeight').value = record.weight || '';
    document.getElementById('editHeight').value = record.height || '';
    document.getElementById('editPulse').value = record.pulse || '';
    document.getElementById('editBp1').value = record.bp1 || '';
    document.getElementById('editBp2').value = record.bp2 || '';
    document.getElementById('editFbs').value = record.fbs || '';
    document.getElementById('editNextAppointmentDate').value = record.next_appointment_date || '';
    document.getElementById('editDoctorNote').value = record.doctor_note || '';
    
    const currentDiseases = String(record.underlying_diseases || '');
    ['Dm', 'Ht', 'Ckd', 'Asthma', 'Copd', 'Stroke', 'Dld', 'Thyroid'].forEach(dis => {
        const el = document.getElementById(`edit${dis}`);
        if(el) el.checked = currentDiseases.includes(el.value);
    });

    const standardKeywords = ['DM', 'HT', 'CKD', 'Asthma', 'COPD', 'Stroke', 'DLD', 'ไทรอยด์'];
    let otherParts = currentDiseases.split(',').map(s => s.trim()).filter(s => s && !standardKeywords.some(kw => s.includes(kw)));
    document.getElementById('editOtherDisease').value = otherParts.join(', ');

    document.querySelectorAll('input[name="editAppointStatus"]').forEach(r => r.checked = (record.appoint_status === r.value));
    document.querySelectorAll('input[name="editSeeDoctor"]').forEach(r => r.checked = (record.see_doctor === r.value));

    document.getElementById('editModal').classList.remove('hidden');
}

async function saveEditedRecord() {
    const id = document.getElementById('editRecordId').value;
    const diseasesArr = [];
    ['Dm', 'Ht', 'Ckd', 'Asthma', 'Copd', 'Stroke', 'Dld', 'Thyroid'].forEach(dis => {
        const el = document.getElementById(`edit${dis}`);
        if(el && el.checked) diseasesArr.push(el.value);
    });

    const otherInput = document.getElementById('editOtherDisease').value.trim();
    if (otherInput) diseasesArr.push(otherInput);

    const diseaseStr = diseasesArr.join(', ');
    const checkedAppoint = document.querySelector('input[name="editAppointStatus"]:checked');
    const checkedSeeDoctor = document.querySelector('input[name="editSeeDoctor"]:checked');

    const rawDate = document.getElementById('editNextAppointmentDate').value.trim();

    const updatedData = {
        age: document.getElementById('editAge').value ? parseInt(document.getElementById('editAge').value) : null,
        weight: document.getElementById('editWeight').value ? parseFloat(document.getElementById('editWeight').value) : null,
        height: document.getElementById('editHeight').value ? parseFloat(document.getElementById('editHeight').value) : null,
        pulse: document.getElementById('editPulse').value ? parseInt(document.getElementById('editPulse').value) : null,
        bp1: document.getElementById('editBp1').value || '',
        bp2: document.getElementById('editBp2').value || '',
        fbs: document.getElementById('editFbs').value || '',
        next_appointment_date: rawDate ? rawDate : null,
        doctor_note: document.getElementById('editDoctorNote').value || '',
        diseases: diseaseStr,
        underlying_diseases: diseaseStr,
        appoint_status: checkedAppoint ? checkedAppoint.value : '',
        see_doctor: checkedSeeDoctor ? checkedSeeDoctor.value : '',
        doctor_visit: checkedSeeDoctor ? checkedSeeDoctor.value : ''
    };

    const { error } = await supabaseClient.from('health_records').update(updatedData).eq('id', id);
    if (error) {
        alert('❌ บันทึกไม่สำเร็จ: ' + error.message);
    } else {
        alert('✅ บันทึกข้อมูลสำเร็จ');
        closeEditModal();
        loadData();
    }
}

function closeEditModal() { document.getElementById('editModal').classList.add('hidden'); }

function exportToExcel() {
    if (!globalRecords || globalRecords.length === 0) { alert('⚠️ ไม่มีข้อมูลสำหรับ Export'); return; }

    const exportData = globalRecords.map((r, index) => ({
        "ลำดับ": index + 1,
        "PID": String(r.id_card || ''),
        "ชื่อ-นามสกุล": r.fullname || '',
        "อายุ": r.age || '',
        "หมู่ที่": r.village_no || '',
        "ตำบล": r.subdistrict || '',
        "บ้านเลขที่": r.house_no || '',
        "น้ำหนัก": r.weight || '',
        "ส่วนสูง": r.height || '',
        "BP1": r.bp1 || '',
        "BP2": r.bp2 || '',
        "ชีพจร": r.pulse || '',
        "FBS": r.fbs || '',
        "วันนัดถัดไป": r.next_appointment_date || '',
        "คำสั่งพยาบาล": r.doctor_note || '',
        "โรคประจำตัว": r.underlying_diseases || '-',
        "สถานะนัด": r.appoint_status || '-',
        "การพบแพทย์": r.see_doctor || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "HealthRecords");
    XLSX.writeFile(workbook, `Health_Records_${document.getElementById('selectViewYear').value}-${document.getElementById('selectViewMonth').value}.xlsx`);
}

async function deleteEntireMonth() {
    const targetMonthYear = `${document.getElementById('selectViewYear').value}-${document.getElementById('selectViewMonth').value}`;
    if (!confirm(`⚠️ ยืนยันลบข้อมูลทั้งหมดของเดือน ${targetMonthYear}?`)) return;
    const { error } = await supabaseClient.from('health_records').delete().eq('month_year', targetMonthYear);
    if (!error) { alert('ลบข้อมูลเรียบร้อย'); loadData(); }
    else alert('ลบไม่สำเร็จ: ' + error.message);
}

async function importExcelData() {
    const fileInput = document.getElementById('excelFile');
    if (!fileInput || !fileInput.files[0]) { alert("⚠️ กรุณาเลือกไฟล์ Excel ก่อนครับ!"); return; }

    const file = fileInput.files[0];
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array', cellText: true, cellDates: true });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonRows = XLSX.utils.sheet_to_json(worksheet, { raw: false, defval: '' });

            if (!jsonRows || jsonRows.length === 0) { alert("❌ ไม่พบข้อมูลในไฟล์"); return; }

            const targetMonthYear = `${document.getElementById('importYear').value}-${document.getElementById('importMonth').value}`;
            
            const getVal = (row, keys) => {
                const rowKeys = Object.keys(row);
                for (let k of keys) {
                    let found = rowKeys.find(rKey => rKey.trim().replace(/\s+/g, '').toLowerCase() === k.trim().replace(/\s+/g, '').toLowerCase());
                    if (found !== undefined && row[found] !== '' && row[found] !== null && row[found] !== undefined) return String(row[found]).trim();
                }
                return '';
            };

            const { data: existingData } = await supabaseClient.from('health_records').select('*').eq('month_year', targetMonthYear);
            const existingMap = new Map((existingData || []).map(item => [String(item.id_card).trim(), item]));

            const finalRowsToUpsert = [];

            jsonRows.forEach((row, index) => {
                let rawPid = getVal(row, ['pid', 'id_card', 'เลขบัตร', 'บัตรประชาชน', 'เลขประจำตัว', 'cid']);
                const pid = rawPid.replace(/[^0-9]/g, '') || `NO_PID_${index + 1}_${Date.now()}`;
                
                let fullname = getVal(row, ['ชื่อ-นามสกุล', 'fullname', 'ชื่อ - สกุล', 'ชื่อสกุล']);
                if (!fullname) {
                    let fname = getVal(row, ['ชื่อ', 'FIRSTNAME', 'FNAME']);
                    let lname = getVal(row, ['นามสกุล', 'LASTNAME', 'LNAME']);
                    if (fname || lname) fullname = `${fname} ${lname}`.trim();
                }
                if (!fullname) fullname = `ไม่ระบุชื่อ (${index + 1})`;

                const old = existingMap.get(pid) || {};
                
                const villageVal = getVal(row, ['หมู่', 'หมู่ที่', 'village_no', 'v_no']);
                let vNumber = old.village_no || 1;
                if (villageVal) {
                    const matchV = String(villageVal).match(/\d+/);
                    if (matchV) vNumber = parseInt(matchV[0]);
                }

                let ageVal = getVal(row, ['อายุ', 'age']);
                let parsedAge = ageVal ? parseInt(String(ageVal).replace(/[^0-9]/g, '')) : old.age;

                let houseVal = getVal(row, ['บ้านเลขที่', 'house_no', 'บ้าน', 'house']) || old.house_no || '-';
                let subVal = getVal(row, ['ตำบล', 'subdistrict', 'ต.']) ? String(getVal(row, ['ตำบล', 'subdistrict', 'ต.'])).replace(/^ต\.?\s*/i, '').trim() : (old.subdistrict || '');

                finalRowsToUpsert.push({
                    hosp_code: '10701',
                    id_card: pid,
                    fullname: fullname,
                    age: isNaN(parsedAge) ? null : parsedAge,
                    house_no: houseVal,
                    village_no: vNumber,
                    subdistrict: subVal,
                    month_year: targetMonthYear,
                    weight: old.weight || null,
                    height: old.height || null,
                    bp1: old.bp1 || '',
                    bp2: old.bp2 || '',
                    pulse: old.pulse || null,
                    fbs: old.fbs || null,
                    smoking: old.smoking || '',
                    drinking: old.drinking || '',
                    next_appointment_date: old.next_appointment_date || null,
                    doctor_note: old.doctor_note || '',
                    diseases: old.diseases || old.underlying_diseases || '',
                    underlying_diseases: old.diseases || old.underlying_diseases || '',
                    appoint_status: old.appoint_status || '',
                    see_doctor: old.see_doctor || old.doctor_visit || '',
                    doctor_visit: old.see_doctor || old.doctor_visit || ''
                });
            });

            if (finalRowsToUpsert.length === 0) {
                alert("⚠️ ไม่พบข้อมูลที่จะนำเข้า กรุณาตรวจสอบไฟล์ Excel อีกครั้ง");
                return;
            }

            if (!confirm(`ต้องการนำเข้าข้อมูลทั้งหมด ${finalRowsToUpsert.length} รายการ สู่รอบเดือน ${targetMonthYear} ใช่หรือไม่?`)) return;

            const chunkSize = 50;
            let hasError = false;

            for (let i = 0; i < finalRowsToUpsert.length; i += chunkSize) {
                const chunk = finalRowsToUpsert.slice(i, i + chunkSize);
                const { error } = await supabaseClient.from('health_records').upsert(chunk, { onConflict: 'id_card, month_year' });
                if (error) {
                    console.error(error);
                    hasError = true;
                    alert("❌ เกิดข้อผิดพลาดที่ชุดข้อมูลแถวที่ " + i + ": " + error.message);
                    break;
                }
            }

            if (!hasError) {
                alert(`🎉 นำเข้าข้อมูลสำเร็จทั้งหมด ${finalRowsToUpsert.length} รายการแล้วครับ!`);
                fileInput.value = '';
                loadData();
            }
        } catch (err) {
            alert("❌ เกิดข้อผิดพลาด: " + err.message);
        }
    };
    reader.readAsArrayBuffer(file);
}