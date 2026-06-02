(ns mimo-platform.core-test
  (:require [clojure.test :refer :all]
            [mimo-platform.core :refer :all]
            [io.pedestal.connector.test :refer [response-for]]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
            [matcher-combinators.test]
            [mimo-platform.core :as core])
  (:import [org.mindrot.jbcrypt BCrypt]
           [java.util UUID])) 

(defn response-json [& args]
  (let [response (apply response-for args)
        content-type (get-in response [:headers "Content-Type"] "application/json")
        body (response :body)
        coerced-body (case content-type
                       "application/json" (json/read-str body)
                       :else body)]
    (assoc response :body coerced-body))
  )

(defn temp-mimo-dir []
  (doto (io/file (System/getProperty "java.io.tmpdir")
                 (str "mimo-platform-test-" (UUID/randomUUID)))
    (.mkdirs)))

(defn write-test-credentials [mimo username password]
  (let [mimo-dir (:mimo-dir mimo)
        user-dir (io/file mimo-dir "users" username)]
    (.mkdirs user-dir)
    (spit (io/file user-dir "credentials.yaml")
          (str "passwordHash: \""
               (BCrypt/hashpw password (BCrypt/gensalt))
               "\"\n"))))

(defn mimo-test []
  (let [mimo-dir (temp-mimo-dir)]
    (core/make-mimo
     :http-port 0
     :mimo-dir (temp-mimo-dir)
     :jwt-secret "secret")))
   
(deftest greet-test
  (let [mimo (mimo-test)
        connector (core/create-connector mimo)]
    (testing "e2e /greet"
      (is (= {"success" true "data" {}} (:body (response-json connector :get "/greet")))))))

(deftest internal-auth-login
  (let [mimo (mimo-test)
        connector (core/create-connector mimo)
        test-user "jova"
        test-password "localhost"]
    (write-test-credentials mimo test-user test-password)
    (testing "successful"
      (is (match? {"success" true "data" {"token" any? "username" test-user "createdAt" any?}}
                  (:body
                   (response-json
                    connector
                    :post "/api/internal/auth/login"
                    :headers {:content-type "application/json"}
                    :body (json/write-str {:username test-user :password test-password}))))))
    (testing "invalid username"
      (is (match? {"success" false "error" "invalid credentials" "code" 401}
                  (:body
                   (response-json
                    connector
                    :post "/api/internal/auth/login"
                    :headers {:content-type "application/json"}
                    :body (json/write-str {:username "invalid-user" :password test-password}))))))
    (testing "invalid password"
      (is (match? {"success" false "error" "invalid credentials" "code" 401}
                  (:body
                   (response-json
                    connector
                    :post "/api/internal/auth/login"
                    :headers {:content-type "application/json"}
                    :body (json/write-str {:username test-user :password "invalid-password"}))))))

    ))
