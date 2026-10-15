
import sqlite3

def find_user(username):
    connection = sqlite3.connect(":memory:")
    cursor = connection.cursor()

    query = "SELECT * FROM users WHERE username = '" + username + "'"
    cursor.execute(query)

    return cursor.fetchall()
