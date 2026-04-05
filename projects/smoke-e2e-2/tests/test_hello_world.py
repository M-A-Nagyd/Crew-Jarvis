import unittest
import sys
import io
from src.main import print_hello_world

class TestHelloWorld(unittest.TestCase):
    def test_print_hello_world(self):
        """Test that we can print 'Hello, World!'""
        # Arrange
        old_stdout = sys.stdout
        capturedOutput = io.StringIO()  # Create StringIO object
        sys.stdout = capturedOutput  # Change stdout to capturedOutput

        # Act
        print_hello_world()

        # Assert
        stdout_value = capturedOutput.getvalue()
        self.assertEqual(stdout_value.strip(), "Hello, World!")

        # Restore stdout
        sys.stdout = old_stdout

    def test_print_hello_world_error(self):
        """Test that we can catch and handle errors"""
        # Arrange
        old_stdout = sys.stdout
        capturedOutput = io.StringIO()  # Create StringIO object
        sys.stdout = capturedOutput  # Change stdout to capturedOutput

        # Act
        try:
            print_hello_world()  # Raise an exception
        except Exception as e:
            # Assert
            self.assertEqual(str(e), "An error occurred: An error occurred")

        # Restore stdout
        sys.stdout = old_stdout

if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]], exit=False)