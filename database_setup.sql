-- ============================================================
--  ShuttleTrack - Complete Master Database Setup Script
--  File: database_setup.sql
--  
--  This is the single master initialization script for the
--  complete Shuttle Tracking and Reservation System.
--
--  Instructions for phpMyAdmin:
--    1. Open http://localhost/phpmyadmin/
--    2. Click the "Import" tab.
--    3. Choose this file: database_setup.sql
--    4. Click "Import" / "Go".
--
--  Default credentials for testing:
--    Admin:     username: admin  | email: admin@shuttletrack.com | password: password123
--    Passenger: username: alice  | email: alice@example.com      | password: password123
--    Driver:    username: juan   | email: juan@example.com       | password: password123
-- ============================================================

-- 1. Create database
CREATE DATABASE IF NOT EXISTS `shuttletrack`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `shuttletrack`;

-- ============================================================
-- 2. Table: users
--    Unified account storage for admins, passengers, and drivers
-- ============================================================
CREATE TABLE IF NOT EXISTS `users` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `username`        VARCHAR(100) NOT NULL UNIQUE,
    `name`            VARCHAR(100) NOT NULL,
    `email`           VARCHAR(150) NOT NULL UNIQUE,
    `password`        VARCHAR(255) NOT NULL,
    `role`            ENUM('admin','passenger','driver') NOT NULL DEFAULT 'passenger',
    `avatar_initials` VARCHAR(4) DEFAULT NULL,
    `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Table: routes
-- ============================================================
CREATE TABLE IF NOT EXISTS `routes` (
    `id`           INT AUTO_INCREMENT PRIMARY KEY,
    `route_code`   VARCHAR(20) NOT NULL UNIQUE,
    `name`         VARCHAR(150) NOT NULL,
    `origin`       VARCHAR(150) NOT NULL,
    `destination`  VARCHAR(150) NOT NULL,
    `distance_km`  DECIMAL(6,2) DEFAULT NULL,
    `duration_min` INT DEFAULT NULL,
    `fare`         DECIMAL(8,2) DEFAULT 0.00,
    `status`       ENUM('Active','Inactive','Maintenance') NOT NULL DEFAULT 'Active',
    `notes`        TEXT DEFAULT NULL,
    `created_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Table: stops
-- ============================================================
CREATE TABLE IF NOT EXISTS `stops` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY,
    `stop_code`  VARCHAR(20) NOT NULL UNIQUE,
    `name`       VARCHAR(150) NOT NULL,
    `address`    VARCHAR(255) NOT NULL,
    `landmark`   VARCHAR(150) DEFAULT NULL,
    `latitude`   DECIMAL(10,7) DEFAULT NULL,
    `longitude`  DECIMAL(10,7) DEFAULT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Table: route_stops (junction: stops belonging to routes)
-- ============================================================
CREATE TABLE IF NOT EXISTS `route_stops` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY,
    `route_id`   INT NOT NULL,
    `stop_id`    INT NOT NULL,
    `stop_order` INT NOT NULL DEFAULT 1,
    UNIQUE KEY `uq_route_stop` (`route_id`, `stop_id`),
    INDEX `idx_stop_id` (`stop_id`),
    CONSTRAINT `fk_route_stops_route` FOREIGN KEY (`route_id`) REFERENCES `routes` (`id`) ON DELETE CASCADE,
    CONSTRAINT `fk_route_stops_stop`  FOREIGN KEY (`stop_id`)  REFERENCES `stops` (`id`)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. Table: shuttles
-- ============================================================
CREATE TABLE IF NOT EXISTS `shuttles` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `shuttle_code`    VARCHAR(20) NOT NULL UNIQUE,
    `plate_number`    VARCHAR(30) NOT NULL UNIQUE,
    `model`           VARCHAR(100) NOT NULL,
    `capacity`        INT NOT NULL DEFAULT 24,
    `year`            YEAR DEFAULT NULL,
    `route_id`        INT DEFAULT NULL,
    `driver_id`       INT DEFAULT NULL,
    `status`          ENUM('Active','Idle','Maintenance') NOT NULL DEFAULT 'Idle',
    `last_maintained` DATE DEFAULT NULL,
    `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_shuttle_route` (`route_id`),
    INDEX `idx_shuttle_driver` (`driver_id`),
    CONSTRAINT `fk_shuttles_route`  FOREIGN KEY (`route_id`)  REFERENCES `routes` (`id`) ON DELETE SET NULL,
    CONSTRAINT `fk_shuttles_driver` FOREIGN KEY (`driver_id`) REFERENCES `users` (`id`)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. Table: schedules
-- ============================================================
CREATE TABLE IF NOT EXISTS `schedules` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `schedule_code`   VARCHAR(20) NOT NULL UNIQUE,
    `route_id`        INT NOT NULL,
    `shuttle_id`      INT NOT NULL,
    `departure_time`  TIME NOT NULL,
    `arrival_time`    TIME NOT NULL,
    `operating_days`  VARCHAR(50) NOT NULL,
    `available_seats` INT NOT NULL DEFAULT 24,
    `status`          ENUM('Active','Suspended','Full') NOT NULL DEFAULT 'Active',
    `created_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_sched_route` (`route_id`),
    INDEX `idx_sched_shuttle` (`shuttle_id`),
    CONSTRAINT `fk_schedules_route`   FOREIGN KEY (`route_id`)   REFERENCES `routes` (`id`)   ON DELETE CASCADE,
    CONSTRAINT `fk_schedules_shuttle` FOREIGN KEY (`shuttle_id`) REFERENCES `shuttles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. Table: bookings
-- ============================================================
CREATE TABLE IF NOT EXISTS `bookings` (
    `id`               INT AUTO_INCREMENT PRIMARY KEY,
    `booking_code`     VARCHAR(20) NOT NULL UNIQUE,
    `passenger_id`     INT NOT NULL,
    `schedule_id`      INT NOT NULL,
    `travel_date`      DATE NOT NULL,
    `seat_number`      VARCHAR(10) NOT NULL,
    `fare`             DECIMAL(8,2) NOT NULL DEFAULT 0.00,
    `special_requests` TEXT DEFAULT NULL,
    `status`           ENUM('Confirmed','Pending','Cancelled','Completed') NOT NULL DEFAULT 'Pending',
    `booked_at`        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_booking_passenger` (`passenger_id`),
    INDEX `idx_booking_schedule` (`schedule_id`),
    CONSTRAINT `fk_bookings_passenger` FOREIGN KEY (`passenger_id`) REFERENCES `users` (`id`)     ON DELETE CASCADE,
    CONSTRAINT `fk_bookings_schedule`  FOREIGN KEY (`schedule_id`)  REFERENCES `schedules` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. Table: shuttle_locations (Optional real-time telemetry)
-- ============================================================
CREATE TABLE IF NOT EXISTS `shuttle_locations` (
    `id`         INT AUTO_INCREMENT PRIMARY KEY,
    `shuttle_id` INT NOT NULL,
    `latitude`   DECIMAL(10,7) NOT NULL,
    `longitude`  DECIMAL(10,7) NOT NULL,
    `speed_kmh`  DECIMAL(5,2) DEFAULT 0.00,
    `heading`    INT DEFAULT 0,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX `idx_location_shuttle` (`shuttle_id`),
    CONSTRAINT `fk_location_shuttle` FOREIGN KEY (`shuttle_id`) REFERENCES `shuttles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. SEED DATA (Uses INSERT IGNORE for safe re-runs)
-- ============================================================

-- Users: Passwords hashed for 'password123' using PHP password_hash(..., PASSWORD_DEFAULT)
INSERT IGNORE INTO `users` (`id`, `username`, `name`, `email`, `password`, `role`, `avatar_initials`) VALUES
(1,  'admin',  'Admin User',      'admin@shuttletrack.com', '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'admin',     'AD'),
(2,  'alice',  'Alice Santos',    'alice@example.com',       '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'passenger', 'AS'),
(3,  'bob',    'Bob Reyes',       'bob@example.com',         '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'passenger', 'BR'),
(4,  'carol',  'Carol Lim',       'carol@example.com',       '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'passenger', 'CL'),
(5,  'dan',    'Dan Cruz',        'dan@example.com',         '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'passenger', 'DC'),
(6,  'eva',    'Eva Torres',      'eva@example.com',         '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'passenger', 'ET'),
(7,  'juan',   'Juan Dela Cruz',  'juan@example.com',        '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'JD'),
(8,  'pedro',  'Pedro Santos',    'pedro@example.com',       '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'PS'),
(9,  'maria',  'Maria Reyes',     'maria@example.com',       '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'MR'),
(10, 'carlos', 'Carlos Mendoza',  'carlos@example.com',      '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'CM'),
(11, 'ana',    'Ana Bautista',    'ana@example.com',         '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'AB'),
(12, 'jose',   'Jose Ramos',      'jose@example.com',        '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'JR'),
(13, 'liza',   'Liza Garcia',     'liza@example.com',        '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'LG'),
(14, 'mark',   'Mark Torres',     'mark@example.com',        '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'MT'),
(15, 'rosa',   'Rosa Villanueva', 'rosa@example.com',        '$2y$10$pwHDQdoZordu7i8llSXune2EJp.Fz1GNbDy/ZLBe/Sq25htLIXMh6', 'driver',    'RV');

-- Routes
INSERT IGNORE INTO `routes` (`id`, `route_code`, `name`, `origin`, `destination`, `distance_km`, `duration_min`, `fare`, `status`, `notes`) VALUES
(1, 'RT-001', 'Campus Express',    'Main Campus',      'City Terminal',    12.50, 45, 25.00, 'Active',      'Main campus to city center route'),
(2, 'RT-002', 'North Loop',        'North Gate',       'Science Park',      8.20, 35, 20.00, 'Active',      'Northern campus loop'),
(3, 'RT-003', 'South Connector',   'South Housing',    'Admin Building',    5.70, 25, 15.00, 'Active',      'South dormitory connector'),
(4, 'RT-004', 'East-West Shuttle', 'East Dorm',        'West Library',      3.40, 20, 15.00, 'Active',      'Cross-campus shuttle'),
(5, 'RT-005', 'Hospital Route',    'Main Campus',      'General Hospital',  9.10, 50, 30.00, 'Active',      'Medical facility route'),
(6, 'RT-006', 'Mall Express',      'Gymnasium',        'SM City Mall',     14.00, 60, 35.00, 'Inactive',    'Weekend mall service'),
(7, 'RT-007', 'Airport Link',      'Admin Building',   'Airport Terminal', 22.30, 75, 50.00, 'Maintenance', 'Airport transfer route'),
(8, 'RT-008', 'Tech Hub',          'Engineering Bldg', 'IT Park',           6.80, 25, 20.00, 'Active',      'Tech campus to IT Park');

-- Stops
INSERT IGNORE INTO `stops` (`id`, `stop_code`, `name`, `address`, `landmark`, `latitude`, `longitude`) VALUES
(1,  'SP-001', 'Main Gate',        'University Ave., Main Campus',       'Guard House',      10.3157200, 123.8854000),
(2,  'SP-002', 'Admin Building',   'Admin Circle, Main Campus',          'Flagpole',         10.3168000, 123.8861000),
(3,  'SP-003', 'Library Stop',     'Knowledge Drive, Main Campus',       'Old Library',      10.3162000, 123.8849000),
(4,  'SP-004', 'Gymnasium Hub',    'Sports Ave., Main Campus',           'Gymnasium',        10.3154000, 123.8842000),
(5,  'SP-005', 'City Terminal',    'Osmeña Blvd, City Center',           'Bus Terminal',     10.2947000, 123.8931000),
(6,  'SP-006', 'North Gate Stop',  'North Campus Road',                  'North Gate',       10.3245000, 123.8870000),
(7,  'SP-007', 'College of Eng.',  'Engineering Complex, N. Campus',     'Eng. Building',    10.3238000, 123.8859000),
(8,  'SP-008', 'Science Park',     'Research Drive, N. Campus',          'Research Center',  10.3255000, 123.8882000),
(9,  'SP-009', 'South Housing',    'Dormitory Rd, S. Campus',            'Dorm A',           10.3089000, 123.8822000),
(10, 'SP-010', 'East Dorm',        'Eastern Campus Road',                'Dorm E',           10.3164000, 123.8891000),
(11, 'SP-011', 'West Library',     'Western Campus Road',                'Library West',     10.3159000, 123.8811000),
(12, 'SP-012', 'General Hospital', 'Osmena Blvd, Downtown',              'Hospital Main',    10.2912000, 123.8895000),
(13, 'SP-013', 'Gymnasium',        'Sports Complex, Main Campus',        'Sports Complex',   10.3155000, 123.8844000),
(14, 'SP-014', 'SM City Mall',     'North Reclamation Area, Cebu City',  'SM Entrance',      10.3114000, 123.9185000),
(15, 'SP-015', 'Airport Terminal', 'Mactan-Cebu International Airport',  'MCIA Departure',   10.3082000, 123.9790000),
(16, 'SP-016', 'Engineering Bldg', 'Engineering Complex, Main Campus',   'Main Eng. Bldg',   10.3172000, 123.8863000),
(17, 'SP-017', 'IT Park',          'Cebu IT Park, Lahug',                'IT Park Gate',     10.3305000, 123.9044000),
(18, 'SP-018', 'Midtown Stop',     'V. Rama Ave, Midtown',               'Midtown Junction', 10.3010000, 123.8902000),
(19, 'SP-019', 'Research Center',  'Science Complex, N. Campus',         'Research Bldg',    10.3250000, 123.8876000),
(20, 'SP-020', 'South Gate',       'Southern Campus Entrance',           'South Guard',      10.3091000, 123.8815000);

-- Route Stops
INSERT IGNORE INTO `route_stops` (`id`, `route_id`, `stop_id`, `stop_order`) VALUES
(1,  1, 1,  1), (2,  1, 2,  2), (3,  1, 3,  3), (4,  1, 4,  4), (5,  1, 18, 5), (6,  1, 5,  6),
(7,  2, 6,  1), (8,  2, 7,  2), (9,  2, 19, 3), (10, 2, 8,  4),
(11, 3, 9,  1), (12, 3, 20, 2), (13, 3, 4,  3), (14, 3, 2,  4),
(15, 4, 10, 1), (16, 4, 2,  2), (17, 4, 11, 3),
(18, 5, 1,  1), (19, 5, 2,  2), (20, 5, 18, 3), (21, 5, 5,  4), (22, 5, 12, 5),
(23, 6, 13, 1), (24, 6, 18, 2), (25, 6, 14, 3),
(26, 7, 2,  1), (27, 7, 5,  2), (28, 7, 15, 3),
(29, 8, 16, 1), (30, 8, 17, 2);

-- Shuttles
INSERT IGNORE INTO `shuttles` (`id`, `shuttle_code`, `plate_number`, `model`, `capacity`, `year`, `route_id`, `driver_id`, `status`, `last_maintained`) VALUES
(1,  'SH-001', 'ABC-1234', 'Toyota Coaster',   24, 2021, 1,    7,    'Active',      '2026-08-15'),
(2,  'SH-002', 'DEF-5678', 'Isuzu ELF',        20, 2020, 1,    8,    'Active',      '2026-07-20'),
(3,  'SH-003', 'GHI-9012', 'Toyota Coaster',   24, 2022, 2,    9,    'Active',      '2026-09-01'),
(4,  'SH-004', 'JKL-3456', 'Hyundai County',   24, 2021, 3,    10,   'Active',      '2026-08-30'),
(5,  'SH-005', 'MNO-7890', 'Isuzu ELF',        20, 2020, 4,    11,   'Active',      '2026-08-10'),
(6,  'SH-006', 'PQR-1122', 'Toyota Coaster',   24, 2022, 5,    12,   'Active',      '2026-09-05'),
(7,  'SH-007', 'STU-3344', 'Mitsubishi Rosa',  30, 2019, 6,    13,   'Idle',        '2026-06-15'),
(8,  'SH-008', 'VWX-5566', 'Toyota Coaster',   20, 2021, 8,    14,   'Active',      '2026-08-25'),
(9,  'SH-009', 'YZA-7788', 'Isuzu ELF',        20, 2020, NULL, NULL, 'Idle',        '2026-05-10'),
(10, 'SH-010', 'BCD-9900', 'Toyota Coaster',   24, 2018, 7,    15,   'Maintenance', '2026-04-01'),
(11, 'SH-011', 'EFG-1111', 'Hyundai County',   24, 2023, NULL, NULL, 'Idle',        '2026-09-12'),
(12, 'SH-012', 'HIJ-2222', 'Mitsubishi Rosa',  30, 2019, NULL, NULL, 'Maintenance', '2026-03-20');

-- Schedules
INSERT IGNORE INTO `schedules` (`id`, `schedule_code`, `route_id`, `shuttle_id`, `departure_time`, `arrival_time`, `operating_days`, `available_seats`, `status`) VALUES
(1,  'SC-001', 1, 1, '06:00:00', '06:45:00', 'Mon,Tue,Wed,Thu,Fri',         24, 'Active'),
(2,  'SC-002', 1, 2, '08:00:00', '08:45:00', 'Mon,Tue,Wed,Thu,Fri',         20, 'Active'),
(3,  'SC-003', 1, 1, '12:00:00', '12:45:00', 'Mon,Tue,Wed,Thu,Fri,Sat',     18, 'Active'),
(4,  'SC-004', 2, 3, '07:00:00', '07:35:00', 'Mon,Tue,Wed,Thu,Fri',         24, 'Active'),
(5,  'SC-005', 2, 3, '13:00:00', '13:35:00', 'Mon,Tue,Wed,Thu,Fri',         12, 'Active'),
(6,  'SC-006', 3, 4, '06:30:00', '06:55:00', 'Mon,Tue,Wed,Thu,Fri,Sat,Sun', 24, 'Active'),
(7,  'SC-007', 4, 5, '07:30:00', '07:50:00', 'Mon,Tue,Wed,Thu,Fri',         20, 'Full'),
(8,  'SC-008', 5, 6, '09:00:00', '09:50:00', 'Mon,Tue,Wed,Thu,Fri,Sat',     24, 'Active'),
(9,  'SC-009', 6, 7, '10:00:00', '11:00:00', 'Sat,Sun',                     30, 'Active'),
(10, 'SC-010', 8, 8, '08:00:00', '08:25:00', 'Mon,Tue,Wed,Thu,Fri',         20, 'Active');

-- Bookings
INSERT IGNORE INTO `bookings` (`id`, `booking_code`, `passenger_id`, `schedule_id`, `travel_date`, `seat_number`, `fare`, `status`) VALUES
(1,  'BK-001', 2, 1,  '2026-09-25', 'A1', 25.00, 'Confirmed'),
(2,  'BK-002', 3, 4,  '2026-09-25', 'B3', 20.00, 'Confirmed'),
(3,  'BK-003', 4, 6,  '2026-09-26', 'C2', 15.00, 'Confirmed'),
(4,  'BK-004', 5, 2,  '2026-09-26', 'A5', 25.00, 'Pending'),
(5,  'BK-005', 6, 8,  '2026-09-26', 'D1', 30.00, 'Confirmed'),
(6,  'BK-006', 2, 10, '2026-09-27', 'B2', 20.00, 'Confirmed'),
(7,  'BK-007', 3, 7,  '2026-09-27', 'A3', 15.00, 'Cancelled'),
(8,  'BK-008', 2, 3,  '2026-09-27', 'C4', 25.00, 'Confirmed'),
(9,  'BK-009', 4, 5,  '2026-09-28', 'B1', 20.00, 'Pending'),
(10, 'BK-010', 3, 9,  '2026-09-28', 'E5', 35.00, 'Confirmed'),
(11, 'BK-011', 2, 1,  '2026-09-29', 'A2', 25.00, 'Completed'),
(12, 'BK-012', 5, 10, '2026-09-29', 'B4', 20.00, 'Confirmed');
