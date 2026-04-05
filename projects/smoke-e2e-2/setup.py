from setuptools import setup, find_packages

setup(
    name="HelloWorld",
    version="1.0",
    packages=find_packages('src'),  # Use find_packages to automatically find packages
    package_dir={'': 'src'},  # Specify package directory
    install_requires=[],  # Specify install requirements (not empty in this case)
    python_requires=">=3.8",
    author="Senior Developer",
    author_email="seniordveloper@example.com",  # Fix email syntax
    description="A simple Python project to print 'Hello, World!'"
)