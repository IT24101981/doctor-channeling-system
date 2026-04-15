
import './App.css';
import { Routes, Route } from 'react-router-dom';
import Landing from './page/landing';
import ECare from './page/eCare';
import Login from './page/Login';
import ForgotPassword from './page/ForgotPassword';
import Signup from './page/Signup';
import DoctorSignup from './page/DoctorSignup';
import StaffLogin from './page/StaffLogin';
import AdminDashboard from './page/staff/AdminDashboard';
import CashierDashboard from './page/staff/CashierDashboard';
import HRDashboard from './page/staff/HRDashboard';
import BookingManagerDashboard from './page/staff/BookingManagerDashboard';
import RefundPayment from './page/staff/RefundPayment';
import StaffProtectedRoute from './Components/StaffProtectedRoute';
import CreateSchedule from './page/staff/CreateSchedule';
import ManageSchedules from './page/staff/ManageSchedules';
import AppointmentForm from './page/AppointmentForm';
import CustomerSupport from './page/CustomerSupport';
import HRCustomerSupport from './page/staff/HRCustomerSupport';
import PaymentPortal from './page/PaymentPortal';
import SuccessPayment from './Components/sucessPayment';
import FailedPayment from './Components/failedPayment';
import ReportExplainer from './page/reportExplainer';
import SmartDocSuggestion from './page/smartDocSuggestion';
import DoctorAvailability from './page/DoctorAvailability';
import DoctorSearchResults from './page/DoctorSearchResults';
import DoctorProfile from './page/DoctorProfile';
import DoctorPending from './page/DoctorPending';
import DoctorReject from './page/DoctorReject';
import GlobalModals from './Components/GlobalModals';

function App() {
  return (
    <>
      <GlobalModals />
      <div className="App">
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/eCare" element={<ECare />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/signup" element={<Signup />} />
          <Route path="/ecare/doc-signup" element={<DoctorSignup />} />
          <Route path="/ecare/staff-login" element={<StaffLogin />} />
          <Route path="/ecare/staff/admin" element={<StaffProtectedRoute element={<AdminDashboard />} allowedRoles={['Admin']} />} />
          <Route path="/ecare/staff/cashier" element={<StaffProtectedRoute element={<CashierDashboard />} allowedRoles={['Cashier']} />} />
          <Route path="/ecare/staff/refunds" element={<StaffProtectedRoute element={<RefundPayment />} allowedRoles={['Cashier', 'Admin']} />} />
          <Route path="/ecare/staff/hr" element={<StaffProtectedRoute element={<HRDashboard />} allowedRoles={['HR']} />} />
          <Route path="/ecare/staff/booking" element={<StaffProtectedRoute element={<BookingManagerDashboard />} allowedRoles={['Booking Manager']} />} />
          <Route path="/schedules/create" element={<StaffProtectedRoute element={<CreateSchedule />} allowedRoles={['Booking Manager']} />} />
          <Route path="/schedules/manage" element={<StaffProtectedRoute element={<ManageSchedules />} allowedRoles={['Booking Manager']} />} />
          <Route path="/appointments/new/:schedule_id/:doctor_id" element={<AppointmentForm />} />
          <Route path="/ecare/customer-support" element={<CustomerSupport />} />
          <Route path="/ecare/staff/customer-support" element={<StaffProtectedRoute element={<HRCustomerSupport />} allowedRoles={['HR', 'Admin']} />} />
          <Route path="/ecare/payment" element={<PaymentPortal />} />
          <Route path="/ecare/payment/success" element={<SuccessPayment />} />
          <Route path="/ecare/payment/failed" element={<FailedPayment />} />
          <Route path="/ecare/report-explainer" element={<ReportExplainer />} />
          <Route path="/ecare/smart-doc-suggestion" element={<SmartDocSuggestion />} />
          <Route path="/doctor-availability" element={<DoctorAvailability />} />
          <Route path="/doctorprofile" element={<DoctorProfile />} />
          <Route path="/ecare/doctors" element={<DoctorSearchResults />} />
          <Route path="/ecare/staff/HRCustomerSupport" element={<StaffProtectedRoute element={<HRCustomerSupport />} allowedRoles={['HR', 'Admin']} />} />
          <Route path="/doctorpending" element={<DoctorPending />} />
          <Route path="/doctorreject" element={<DoctorReject />} />
        </Routes>
      </div>
    </>
  );
}

export default App;
