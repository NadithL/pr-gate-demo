import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import javax.servlet.http.HttpServletRequest;

public class UserController {

    public ResultSet findUser(HttpServletRequest request) throws Exception {
        String username = request.getParameter("username");
        Connection conn = DriverManager.getConnection("jdbc:sqlite:app.db");
        Statement stmt = conn.createStatement();

        // VULNERABLE: user input concatenated into the SQL string
        String query = "SELECT id, email FROM users WHERE username = '" + username + "'";
        return stmt.executeQuery(query);
    }
}
