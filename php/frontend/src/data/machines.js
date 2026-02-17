import craneImage from '../images/crane.png';
import heavyImage from '../images/heavy.png';
import vehicleImage from '../images/vehicle.png';
import supportImage from '../images/support.png';
import plantImage from '../images/plant.png';


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
        icon: 'https://cdn-icons-png.flaticon.com/512/11242/11242072.png',
        description: 'ดูเครื่องจักรทั้งหมด',
        to: '/categories',
    },
    {
        id: 'scanner',
        title: 'เครื่องอ่านบาร์โค้ด',
        cta: 'สแกน',
        icon: 'https://cdn-icons-png.flaticon.com/512/7463/7463734.png',
        description: 'สแกนเพื่อค้นหาเครื่องจักรอย่างรวดเร็ว',
        to: '/scanner',
    },
    {
        id: 'oil-log',
        title: 'บันทึกน้ำมัน',
        cta: 'เปิดบันทึก',
        icon: 'https://cdn-icons-png.flaticon.com/512/2051/2051289.png',
        description: 'จดปริมาณการใช้น้ำมันของแต่ละเครื่อง',
        to: '/oil-log',
    },
    {
        id: 'reports',
        title: 'รายงานปัญหาเกี่ยวกับเครื่องจักร',
        cta: 'รายงานปัญหา',
        icon: 'https://cdn-icons-png.flaticon.com/512/9824/9824404.png',
        description: 'รายงานปัญหาหรือข้อเสนอแนะต่างๆ',
        to: '/reports',
    },
    {
        id: 'machine-work',
        title: 'แบบฟอร์มบันทึกงานเครื่องจักร',
        cta: 'เปิดฟอร์ม',
        icon: 'https://cdn-icons-png.flaticon.com/512/16840/16840271.png',
        description: 'บันทึกงานที่ปฏิบัติกับเครื่องจักร',
        to: '/machine-work',
    },

    {
        id: 'checklist',
        title: 'แบบฟอร์มตรวจเช็ก',
        cta: 'เปิดฟอร์ม',
        icon: 'https://cdn-icons-png.flaticon.com/512/942/942748.png',
        description: 'เช็กลิสต์การบำรุงรักษาประจำวัน',
        to: '/checklist',
    },
];