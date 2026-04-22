-- Create the database if it doesn't exist
CREATE DATABASE IF NOT EXISTS doctor_channeling_db;

USE doctor_channeling_db;

-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(100) NOT NULL,
    second_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    nic VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    profile_photo VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    account_status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS doctors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    specialization VARCHAR(150) NOT NULL,
    slmc_id VARCHAR(100) UNIQUE NOT NULL,
    nic VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(20) NOT NULL,
    hospital VARCHAR(255),
    password_hash VARCHAR(255) NOT NULL,
    consulting_fee DECIMAL(10,2) DEFAULT 1000.00,
    status ENUM('approved', 'pending', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS appointment_schedules (
    id INT AUTO_INCREMENT PRIMARY KEY,
    doctor_id INT NULL,
    schedule_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    max_patients INT NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    booked_count INT DEFAULT 0,
    status ENUM('active','full','cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doctor_schedules FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
);

-- Paid / failed state: use payments.appointment_id -> appointments.id (FK on payments table).
CREATE TABLE IF NOT EXISTS appointments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    schedule_id INT NOT NULL,
    doctor_id INT NULL,
    patient_ID INT NULL,
    booking_queue_no INT NOT NULL,
    appointment_status ENUM('added', 'failed', 'cancelled') NOT NULL DEFAULT 'added',
    payment_id INT DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (schedule_id) REFERENCES appointment_schedules(id) ON DELETE CASCADE,
    CONSTRAINT fk_doctor_appointments FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
    FOREIGN KEY (patient_ID) REFERENCES patients(id) ON DELETE SET NULL,
    KEY idx_appointments_schedule_id (schedule_id)
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NULL,
    patient_name VARCHAR(200) NOT NULL,
    patient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    status ENUM('Pending', 'Resolved') DEFAULT 'Pending',
    is_deleted TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS support_tickets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    patient_id INT NOT NULL,
    subject VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    status ENUM('Open', 'In Progress', 'Resolved', 'Closed') DEFAULT 'Open',
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    hr_reply TEXT,
    hr_staff_id INT,
    is_deleted TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (hr_staff_id) REFERENCES staff(id)
);

CREATE TABLE IF NOT EXISTS doc_availability_slots (
    id INT PRIMARY KEY AUTO_INCREMENT,
    doctor_id INT NULL,
    day_of_week VARCHAR(10),
    start_time TIME,
    end_time TIME,
    capacity INT,
    is_available BOOLEAN DEFAULT true,
    slot_duration INT DEFAULT 10,
    Marked TINYINT(1) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_doctor_slots FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payments (
    id INT PRIMARY KEY AUTO_INCREMENT,
    internal_order_id VARCHAR(50) NOT NULL,
    patient_id INT NULL,
    doctor_id INT NULL,
    appointment_schedule_id INT NOT NULL,
    appointment_id INT DEFAULT NULL,
    payhere_payment_id VARCHAR(50) DEFAULT NULL,
    amount DECIMAL (10,2) NOT NULL,
    payment_method VARCHAR(20),
    card_last_digits VARCHAR(4) DEFAULT NULL,
    payment_status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
    CONSTRAINT fk_doctor_payments FOREIGN KEY (doctor_id) REFERENCES doctors(id) ON DELETE SET NULL,
    CONSTRAINT fk_appointments_payments FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL,
    FOREIGN KEY (appointment_schedule_id) REFERENCES appointment_schedules(id),
    UNIQUE KEY uniq_payments_internal_order (internal_order_id)
);

ALTER TABLE appointments
    ADD CONSTRAINT fk_appointments_payment_id
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS refund_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    appointment_id INT NOT NULL,
    patient_id INT NULL,
    payment_id INT NULL,
    internal_order_id VARCHAR(50) NOT NULL,
    status ENUM('pending', 'completed', 'rejected') NOT NULL DEFAULT 'pending',
    requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_refund_requests_status (status),
    INDEX idx_refund_requests_appt (appointment_id),
    CONSTRAINT fk_refund_requests_appointment
        FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
    CONSTRAINT fk_refund_requests_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL,
    CONSTRAINT fk_refund_requests_payment
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS payment_email_logs (
    internal_order_id VARCHAR(50) NOT NULL PRIMARY KEY,
    payment_status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payment_email_logs_status (payment_status)
);

-- Password reset OTPs (forgot password flow)
CREATE TABLE IF NOT EXISTS password_reset_otps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    user_type ENUM('patient', 'doctor') NOT NULL,
    otp_hash VARCHAR(255) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_reset_otps_email (email)
);

-- 2. Remove the old trigger to prevent conflicts
DROP TRIGGER IF EXISTS sync_appointment_payment_status;
