
import ast

def calculate(expression):
    result = ast.literal_eval(expression)
    return result
