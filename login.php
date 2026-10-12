<?php
session_start();

// If already authenticated, redirect to appropriate role portal
if (!empty($_SESSION['user_id']) && !empty($_SESSION['role'])) {
    $role = $_SESSION['role'];
    if ($role === 'passenger') {
        header('Location: booking.html');
        exit;
    } elseif ($role === 'driver') {
        header('Location: driver-routes.html');
        exit;
    } elseif ($role === 'admin') {
        header('Location: admin-routes.html');
        exit;
    }
}

require_once __DIR__ . '/db/db.php';

$message = "";
$messageType = "error";

if (isset($_GET['registered'])) {
    $message = "Registration successful! You may now log in.";
    $messageType = "success";
} elseif (isset($_GET['error']) && $_GET['error'] === 'unauthorized') {
    $message = "Please log in to access this page.";
    $messageType = "error";
}

if ($_SERVER["REQUEST_METHOD"] === "POST") {
    $loginInput = trim($_POST["username"] ?? "");
    $password   = $_POST["password"] ?? "";
    $formRole   = trim($_POST["role"] ?? "");

    if (empty($loginInput) || empty($password) || empty($formRole)) {
        $message = "Please enter username/email, password, and select a role.";
        $messageType = "error";
    } else {
        $conn = getConnection();
        // Look up by username or email
        $stmt = $conn->prepare("
            SELECT id, username, name, email, password, role, avatar_initials
            FROM users
            WHERE username = ? OR email = ?
            LIMIT 1
        ");
        $stmt->bind_param("ss", $loginInput, $loginInput);
        $stmt->execute();
        $result = $stmt->get_result();

        if ($result && $result->num_rows === 1) {
            $user = $result->fetch_assoc();
            $stmt->close();

            // Verify password using bcrypt
            if (password_verify($password, $user["password"])) {
                // Server-side role validation: user cannot elevate privileges by selecting a different role
                if ($formRole !== "" && $formRole !== $user["role"]) {
                    $message = "Access denied: Account role does not match the selected portal role.";
                    $messageType = "error";
                } else {
                    // Validated role from trusted server-side data
                    $role = $user["role"];

                    // Initialize session
                    $_SESSION["user_id"]         = (int)$user["id"];
                    $_SESSION["username"]        = $user["username"];
                    $_SESSION["name"]            = $user["name"];
                    $_SESSION["email"]           = $user["email"];
                    $_SESSION["role"]            = $role;
                    $_SESSION["avatar_initials"] = $user["avatar_initials"] ?: strtoupper(substr($user["name"], 0, 2));

                    // Exact role-based destinations
                    if ($role === "passenger") {
                        header("Location: booking.html");
                        exit;
                    } elseif ($role === "driver") {
                        header("Location: driver-routes.html");
                        exit;
                    } elseif ($role === "admin") {
                        header("Location: admin-routes.html");
                        exit;
                    } else {
                        $message = "Unknown account role. Please contact administrator.";
                        $messageType = "error";
                    }
                }
            } else {
                $message = "Invalid username or password.";
                $messageType = "error";
            }
        } else {
            if ($stmt) $stmt->close();
            $message = "Invalid username or password.";
            $messageType = "error";
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>E-Bus Shuttle Tracking - Login</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>

<div class="container">
    <div class="logo">🚌</div>
    <h2>ShuttleTrack Login</h2>

    <?php if ($message != ""): ?>
        <div class="<?= htmlspecialchars($messageType) ?>">
            <?= htmlspecialchars($message) ?>
        </div>
    <?php endif; ?>

    <form method="POST" action="login.php">
        <label for="username">Username or Email</label>
        <input
            type="text"
            id="username"
            name="username"
            placeholder="e.g. admin or alice"
            value="<?= htmlspecialchars($_POST['username'] ?? '') ?>"
            required
            autocomplete="username"
        >

        <label for="password">Password</label>
        <input
            type="password"
            id="password"
            name="password"
            placeholder="Enter password"
            required
            autocomplete="current-password"
        >

        <label for="role">Role</label>
        <select id="role" name="role" required>
            <option value="">Select Role</option>
            <option value="passenger" <?= (($_POST['role'] ?? '') === 'passenger') ? 'selected' : '' ?>>Passenger</option>
            <option value="driver"    <?= (($_POST['role'] ?? '') === 'driver') ? 'selected' : '' ?>>Driver</option>
            <option value="admin"     <?= (($_POST['role'] ?? '') === 'admin') ? 'selected' : '' ?>>Admin</option>
        </select>

        <button type="submit">Login</button>
    </form>

    <div class="signup-link">
        Don't have an account? <a href="signup.php">Sign Up</a>
    </div>

    <hr>
    <p style="font-size:12px;color:#666;text-align:center;margin:0">
        Demo test accounts: <strong>admin</strong> (admin) &bull; <strong>alice</strong> (passenger) &bull; <strong>juan</strong> (driver)<br>
        Default password: <code>password123</code>
    </p>
</div>

</body>
</html>
