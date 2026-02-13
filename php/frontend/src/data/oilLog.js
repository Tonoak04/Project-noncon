export const oilChecklistOtherId = 'other';
export const checklistOtherNoteKey = 'other_note';

export const fuelCategories = [
    { id: 'engine_oil', label: 'น้ำมันเครื่อง' },
    { id: 'hydraulic_oil', label: 'น้ำมันไฮดรอลิค', allowCode: true, codeLabel: '#'},
    { id: 'gear_oil', label: 'น้ำมันเกียร์', allowCode: true, codeLabel: '#'},
    { id: 'torque_oil', label: 'น้ำมันเกียร์ทอร์ค', allowCode: true, codeLabel: '#'},
];

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

export const createFuelDetailsState = () => {
    const state = {};
    fuelCategories.forEach((category) => {
        state[category.id] = {
            enabled: false,
            code: '',
            liters: '',
        };
    });
    return state;
};
