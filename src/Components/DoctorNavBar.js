import { useNavigate } from 'react-router-dom';
import './ComponentsCss/eCareNavBar.css';
import LogoHospital from '../images/LogoHospital.png';

const DoctorNavBar = () => {
    const navigate = useNavigate();

    return (
        <nav className="ecare-navbar">
            <div className="ecare-navbar-brand" onClick={() => navigate('/doctor-availability')} style={{ cursor: 'pointer' }}>
                <div className="ecare-logo-icon">
                    <img src={LogoHospital} alt="NCC Logo" />
                </div>
                <div className="ecare-brand-text">
                    <span className="brand-name">NCC eCare</span>
                    <span className="brand-tagline">Doctor Portal</span>
                </div>
            </div>

            <div className="ecare-navbar-actions">
                <button className="ecare-btn btn-channeling-center" onClick={() => navigate('/')}>
                    <span className="material-symbols-outlined">home</span>
                    Channeling Center
                </button>
            </div>
        </nav>
    );
};

export default DoctorNavBar;
