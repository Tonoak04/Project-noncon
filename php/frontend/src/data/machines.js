import craneImage from '../images/crane.png';
import heavyImage from '../images/heavy.png';
import vehicleImage from '../images/vehicle.png';
import supportImage from '../images/support.png';
import plantImage from '../images/plant.png';
import checklistImage from '../images/form.png';
import chechkdayimage from '../images/formcheckday.png';
import oilimage from '../images/oil.png';
import reportimage from '../images/report.png';
// import scannerimage from '../images/scanner.png';
import machineimage from '../images/machine.png';


export const categories = [
    {
        id: 'heavy',
        title: 'เครื่องจักรหนัก',
        image: heavyImage,
    },
    {
        id: 'crane',
        title: 'ขนส่ง / เครน',
        image: craneImage,
    },
    {
        id: 'vehicle',
        title: 'ยานพาหนะ',
        image: vehicleImage,
    },
    {
        id: 'support',
        title: 'งานสนาม / สนับสนุน',
        image: supportImage,
    },
    {
        id: 'plant',
        title: 'แพล้นท์ / โรงงาน',
        image: plantImage,
    },
];

export const actionCards = [
    {
        id: 'machines',
        title: 'ข้อมูลเครื่องจักร',
        cta: 'ดูเครื่องจักร',
        icon: machineimage,
        description: 'ดูเครื่องจักรทั้งหมด',
        to: '/categories',
    },
    {
        id: 'checklist',
        title: 'แบบฟอร์มตรวจเช็ก',
        cta: 'เปิดฟอร์ม',
        icon: checklistImage,
        description: 'เช็กลิสต์การบำรุงรักษาประจำวัน',
        to: '/checklist',
    },
    {
        id: 'oil-log',
        title: 'บันทึกน้ำมัน',
        cta: 'เปิดบันทึก',
        icon: oilimage,
        description: 'จดปริมาณการใช้น้ำมันของแต่ละเครื่อง',
        to: '/oil-log',
    },
    {
        id: 'machine-work',
        title: 'แบบฟอร์มบันทึกงานเครื่องจักร',
        cta: 'เปิดฟอร์ม',
        icon: chechkdayimage,
        description: 'บันทึกงานที่ปฏิบัติกับเครื่องจักร',
        to: '/machine-work',
    },
    {
        id: 'reports',
        title: 'รายงานปัญหาเกี่ยวกับเครื่องจักร',
        cta: 'รายงานปัญหา',
        icon: reportimage,
        description: 'รายงานปัญหาหรือข้อเสนอแนะต่างๆ',
        to: '/reports',
    },
    // {
    //     id: 'scanner',
    //     title: 'เครื่องอ่านบาร์โค้ด',
    //     cta: 'สแกน',
    //     icon: scannerimage,
    //     description: 'สแกนเพื่อค้นหาเครื่องจักรอย่างรวดเร็ว',
    //     to: '/scanner',
    // },
];