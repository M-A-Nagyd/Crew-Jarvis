import unittest
import main  # noqa: F401

class TestHelloWorldApp(unittest.TestCase):
    def test_main(self):
        main.main()

if __name__ == "__main__":
    unittest.main()