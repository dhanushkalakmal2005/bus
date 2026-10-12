<?php
session_start();

if (!empty($_SESSION['role'])) {
    $role = $_SESSION['role'];
    if ($role === 'passenger') {
        header('Location: booking.html');
        exit();
    } elseif ($role === 'driver') {
        header('Location: driver-routes.html');
        exit();
    } elseif ($role === 'admin') {
        header('Location: admin-routes.html');
        exit();
    }
}

header('Location: login.php');
exit();
