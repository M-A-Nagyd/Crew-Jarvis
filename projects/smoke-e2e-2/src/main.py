import sys

def print_hello_world():
    """Print 'Hello, World!' to the console"""
    print("Hello, World!")

if __name__ == "__main__":
    try:
        print_hello_world()
    except Exception as e:
        print(f"An error occurred: {e}")  # Add error handling