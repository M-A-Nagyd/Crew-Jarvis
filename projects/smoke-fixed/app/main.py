# helloworld/app/main.py
import sys
def main():
    """
    Prints 'Hello, World!' to the console.
    """
    try:
        print("Hello, World!")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
    finally:
        if sys.version_info[0] < 3 or (sys.version_info[0] == 3 and sys.version_info[1] < 7):
            print("Warning: Your Python version is outdated. Please consider upgrading to at least Python 3.7")
        else:
            sys.exit(0)