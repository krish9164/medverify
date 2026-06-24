from flask import Flask
from flask_cors import CORS
from config import Config
import os

app = Flask(__name__)
app.config.from_object(Config)
CORS(app)

# Create uploads folder if it doesn't exist
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# Import and register routes
from routes import documents, pipeline

app.register_blueprint(documents.bp)
app.register_blueprint(pipeline.bp)

if __name__ == '__main__':
    app.run(debug=True, port=5000)