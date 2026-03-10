export const oilChecklistOtherId = 'other';
export const checklistOtherNoteKey = 'other_note';

export const fuelOptions = [
    { id: 'diesel', label: 'ดีเซล' },
    { id: 'gasoline', label: 'เบนซิน' },
];

export const lubricantOptions = [
    { id: 'engine_oil', label: 'น้ำมันเครื่อง' },
    { id: 'hydraulic_oil', label: 'น้ำมันไฮดรอลิค' },
    { id: 'gear_oil', label: 'น้ำมันเกียร์' },
    { id: 'torque_oil', label: 'น้ำมันเกียร์ทอร์ค' },
];

export const lubricantGradeOptions = ['32', '46', '68', '100', '150', '220', '320', '460', '680', 'อื่นๆ'];

export const fuelCategories = [...fuelOptions, ...lubricantOptions];

export const oilChecklistItems = [
    { id: 'tank_level', label: 'ระดับหม้อน้ำ' },
    { id: 'engine_oil', label: 'ระดับน้ำมันเครื่อง' },
    { id: 'jalabee', label: 'อัดจารบีก่อนปฏิบัติงาน' },
    { id: 'machine_work', label: 'การทำงานของเครื่องจักร' },
    {
        id: oilChecklistOtherId,
        label: 'อื่นๆ (ระบุ)',
        allowNote: true,
        singleOption: true,
        notePlaceholder: 'ระบุรายละเอียดเพิ่มเติม',
    },
];

export const oilTimeSegments = [
    { key: 'Morning', label: 'ช่วงเช้า'},
    { key: 'Afternoon', label: 'ช่วงบ่าย'},
    { key: 'Ot', label: 'OT'},
];

export const createChecklistState = () => {
    const state = {};
    oilChecklistItems.forEach((item) => {
        state[item.id] = '';
    });
    return state;
};

export const createFuelSelectionsState = () => ({
    fuels: [{ type: '', liters: '' }],
    lubes: [{ type: '', grade: '', liters: '' }],
});
