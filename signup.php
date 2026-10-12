<?php
session_start();
require_once __DIR__ . '/db/db.php';

$message = "";
$messageType = "";

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $username        = trim($_POST["username"] ?? "");
    $email           = trim($_POST["email"] ?? "");
    $password        = $_POST["password"] ?? "";
    $confirmPassword = $_POST["confirm_password"] ?? "";

    if ($username === "" || $email === "" || $password === "" || $confirmPassword === "") {
        $message = "Please fill in all fields.";
        $messageType = "error";
    } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $message = "Please enter a valid email address.";
        $messageType = "error";
    } elseif (strlen($password) < 6) {
        $message = "Password must contain at least 6 characters.";
        $messageType = "error";
    } elseif ($password !== $confirmPassword) {
        $message = "Passwords do not match.";
        $messageType = "error";
    } else {
        $conn = getConnection();
        // Check whether username or email already exists
        $check = $conn->prepare("SELECT id FROM users WHERE username = ? OR email = ?");
        $check->bind_param("ss", $username, $email);
        $check->execute();
        $check->store_result();

        if ($check->num_rows > 0) {
            $message = "Username or email is already registered.";
            $messageType = "error";
            $check->close();
        } else {
            $check->close();

            // Securely hash password
            $hashedPassword = password_hash($password, PASSWORD_DEFAULT);
            $role = "passenger";
            $name = $username;
            $initials = strtoupper(substr($username, 0, 2));

            $insert = $conn->prepare("
                INSERT INTO users (username, name, email, password, role, avatar_initials)
                VALUES (?, ?, ?, ?, ?, ?)
            ");
            $insert->bind_param("ssssss", $username, $name, $email, $hashedPassword, $role, $initials);

            if ($insert->execute()) {
                $insert->close();
                header("Location: login.php?registered=1");
                exit();
            } else {
                $message = "Registration failed: " . $conn->error;
                $messageType = "error";
                $insert->close();
            }
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-Bus Shuttle Tracking - Create Account</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    <div class="container">
        <div class="logo">🚌</div>
        <h2>Create Account</h2>

        <?php if ($message !== ""): ?>
            <div class="<?= htmlspecialchars($messageType) ?>">
                <?= htmlspecialchars($message) ?>
            </div>
        <?php endif; ?>

        <form method="POST" action="signup.php">
            <label for="username">Username</label>
            <input
                type="text"
                id="username"
                name="username"
                placeholder="Enter username"
                value="<?= htmlspecialchars($_POST['username'] ?? '') ?>"
                maxlength="100"
                autocomplete="username"
                required
            >

            <label for="email">Email</label>
            <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter email address"
                value="<?= htmlspecialchars($_POST['email'] ?? '') ?>"
                maxlength="150"
                autocomplete="email"
                required
            >

            <label for="password">Password</label>
            <input
                type="password"
                id="password"
                name="password"
                placeholder="Create password (min 6 characters)"
                minlength="6"
                autocomplete="new-password"
                required
            >

            <label for="confirm_password">Confirm Password</label>
            <input
                type="password"
                id="confirm_password"
                name="confirm_password"
                placeholder="Confirm password"
                minlength="6"
                autocomplete="new-password"
                required
            >

            <button type="submit">Sign Up</button>
        </form>

        <div class="signup-link">
            Already have an account? <a href="login.php">Login</a>
        </div>
    </div>
</body>
</html>
