import requests
import sys
import json
from datetime import datetime

class YTranscriptAPITester:
    def __init__(self, base_url="https://yt-transcript-5.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED")
        else:
            print(f"❌ {name} - FAILED: {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })

    def test_api_root(self):
        """Test the root API endpoint"""
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            if success:
                data = response.json()
                details += f", Response: {data}"
            self.log_test("API Root Endpoint", success, details)
            return success
        except Exception as e:
            self.log_test("API Root Endpoint", False, str(e))
            return False

    def test_transcript_endpoint_invalid_url(self):
        """Test transcript endpoint with invalid URL"""
        try:
            response = requests.post(
                f"{self.api_url}/transcript",
                json={"url": "not-a-youtube-url"},
                timeout=30
            )
            success = response.status_code == 400
            details = f"Status: {response.status_code}"
            if response.status_code != 200:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data.get('detail', 'No detail')}"
                except:
                    details += f", Response: {response.text[:100]}"
            self.log_test("Transcript Invalid URL", success, details)
            return success
        except Exception as e:
            self.log_test("Transcript Invalid URL", False, str(e))
            return False

    def test_transcript_endpoint_valid_url(self):
        """Test transcript endpoint with valid YouTube URL"""
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        try:
            print(f"🔍 Testing transcript fetch for: {test_url}")
            response = requests.post(
                f"{self.api_url}/transcript",
                json={"url": test_url},
                timeout=120  # Extended timeout for transcript fetching
            )
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            if success:
                data = response.json()
                # Validate response structure
                required_fields = ['video_id', 'title', 'transcript', 'available_languages', 'selected_language']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    success = False
                    details += f", Missing fields: {missing_fields}"
                else:
                    transcript_count = len(data.get('transcript', []))
                    details += f", Video: {data.get('title', 'Unknown')[:50]}, Transcript lines: {transcript_count}"
                    
                    # Validate transcript structure
                    if transcript_count > 0:
                        first_line = data['transcript'][0]
                        required_line_fields = ['text', 'start', 'duration']
                        missing_line_fields = [field for field in required_line_fields if field not in first_line]
                        if missing_line_fields:
                            success = False
                            details += f", Missing transcript fields: {missing_line_fields}"
            else:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data.get('detail', 'No detail')}"
                except:
                    details += f", Response: {response.text[:200]}"
            
            self.log_test("Transcript Valid URL", success, details)
            return success, data if success else None
            
        except Exception as e:
            self.log_test("Transcript Valid URL", False, str(e))
            return False, None

    def test_transcript_with_language(self):
        """Test transcript endpoint with language parameter"""
        test_url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        try:
            response = requests.post(
                f"{self.api_url}/transcript",
                json={"url": test_url, "language": "en"},
                timeout=120
            )
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            if success:
                data = response.json()
                details += f", Selected language: {data.get('selected_language', 'Unknown')}"
            else:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data.get('detail', 'No detail')}"
                except:
                    details += f", Response: {response.text[:200]}"
            
            self.log_test("Transcript with Language", success, details)
            return success
            
        except Exception as e:
            self.log_test("Transcript with Language", False, str(e))
            return False

    def test_languages_endpoint(self):
        """Test the languages endpoint"""
        video_id = "dQw4w9WgXcQ"
        try:
            response = requests.get(f"{self.api_url}/languages/{video_id}", timeout=30)
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            if success:
                data = response.json()
                required_fields = ['video_id', 'title', 'available_languages']
                missing_fields = [field for field in required_fields if field not in data]
                
                if missing_fields:
                    success = False
                    details += f", Missing fields: {missing_fields}"
                else:
                    lang_count = len(data.get('available_languages', []))
                    details += f", Available languages: {lang_count}"
            else:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data.get('detail', 'No detail')}"
                except:
                    details += f", Response: {response.text[:200]}"
            
            self.log_test("Languages Endpoint", success, details)
            return success
            
        except Exception as e:
            self.log_test("Languages Endpoint", False, str(e))
            return False

    def test_status_endpoints(self):
        """Test status check endpoints"""
        try:
            # Test POST status
            post_response = requests.post(
                f"{self.api_url}/status",
                json={"client_name": "test_client"},
                timeout=10
            )
            
            post_success = post_response.status_code == 200
            post_details = f"POST Status: {post_response.status_code}"
            
            if post_success:
                post_data = post_response.json()
                post_details += f", ID: {post_data.get('id', 'Unknown')[:8]}..."
            
            self.log_test("Status POST", post_success, post_details)
            
            # Test GET status
            get_response = requests.get(f"{self.api_url}/status", timeout=10)
            
            get_success = get_response.status_code == 200
            get_details = f"GET Status: {get_response.status_code}"
            
            if get_success:
                get_data = get_response.json()
                get_details += f", Records: {len(get_data)}"
            
            self.log_test("Status GET", get_success, get_details)
            
            return post_success and get_success
            
        except Exception as e:
            self.log_test("Status Endpoints", False, str(e))
            return False

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting ytranscript Backend API Tests")
        print(f"📍 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Test basic connectivity
        if not self.test_api_root():
            print("❌ API root endpoint failed - stopping tests")
            return False
        
        # Test transcript endpoints
        self.test_transcript_endpoint_invalid_url()
        transcript_success, transcript_data = self.test_transcript_endpoint_valid_url()
        
        if transcript_success:
            self.test_transcript_with_language()
            self.test_languages_endpoint()
        
        # Test status endpoints
        self.test_status_endpoints()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        success_rate = (self.tests_passed / self.tests_run) * 100 if self.tests_run > 0 else 0
        print(f"📈 Success Rate: {success_rate:.1f}%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print("⚠️  Some tests failed - check logs above")
            return False

def main():
    tester = YTranscriptAPITester()
    success = tester.run_all_tests()
    
    # Save test results
    with open('/app/backend_test_results.json', 'w') as f:
        json.dump({
            'timestamp': datetime.now().isoformat(),
            'total_tests': tester.tests_run,
            'passed_tests': tester.tests_passed,
            'success_rate': (tester.tests_passed / tester.tests_run) * 100 if tester.tests_run > 0 else 0,
            'results': tester.test_results
        }, f, indent=2)
    
    return 0 if success else 1

if __name__ == "__main__":
    sys.exit(main())