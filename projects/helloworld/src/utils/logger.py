import logging

# Set the logging level
logging.basicConfig(level=logging.DEBUG)

class Logger:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def debug(self, message):
        """Log a debug message."""
        self.logger.debug(message)

    def info(self, message):
        """Log an info message."""
        self.logger.info(message)

    def error(self, message):
        """Log an error message."""
        self.logger.error(message)