(ns mimo-platform.core-test
  (:require [clojure.test :refer :all]
            [mimo-platform.core :refer :all]
            [io.pedestal.connector.test :refer [response-for]]
            [clojure.data.json :as json]
            [matcher-combinators.test]
            [mimo-platform.core :as core])) 

(defn response-json [& args]
  (let [response (apply response-for args)
        content-type (get-in response [:headers "Content-Type"] "application/json")
        body (response :body)
        coerced-body (case content-type
                       "application/json" (json/read-str body)
                       :else body)]
    (assoc response :body coerced-body))
  )

(deftest greet-test
  (let [connector (core/create-connector)]
    (testing "e2e /greet"
      (is (= {"success" true "data" {}} (:body (response-json connector :get "/greet")))))))

(deftest internal-auth-login
  ;; TODO add create credentials
  (let [connector (core/create-connector)
        test-user "jova"
        test-password "localhost"]
    (testing "successful"
      (is (match? {"success" true "data" {"username" test-user}}
                  (:body
                   (response-json
                    connector
                    :post "/api/internal/auth/login"
                    :headers {:content-type "application/json"}
                    :body (json/write-str {:username test-user :password test-password}))))))
    (testing "invalid credentials"
      (is (match? {"success" false "error" "invalid credentials" "code" 401}
                  (:body
                   (response-json
                    connector
                    :post "/api/internal/auth/login"
                    :headers {:content-type "application/json"}
                    :body (json/write-str {:username test-user :password "invalid-password"}))))))

    ))
