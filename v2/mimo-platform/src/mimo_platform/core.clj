(ns mimo-platform.core
  (:require [io.pedestal.connector :as conn]
            [io.pedestal.http.http-kit :as hk]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
            [mimo-platform.credentials :as credentials]
            [io.pedestal.http.content-negotiation :as content-negotiation]))

(def supported-types ["application/json"])

(def content-negotiation-interceptor
  (content-negotiation/negotiate-content supported-types))

(def coerce-body-interceptor
  {:name ::coerce-body
   :leave
   (fn [context]
     (let [accepted (get-in context [:request :accept :field] "application/json")
           response (get context :response)
           body (get response :body)
           coerced-body (case accepted
                          "application/json" (json/write-str body))
           updated-response (assoc response
                                   :headers {"Content-Type" accepted}
                                   :body coerced-body)]
       (assoc context :response updated-response)))
   })

(defn greet-handler [_request]
  {:status 200 :body {:success true :data {}}})

(defn make-mimo [& {:keys [mimo-dir jwt-secret http-port]}]
  {:mimo-dir mimo-dir :jwt-secret jwt-secret :http-port http-port})

(defn auth-login [{:keys [mimo-dir jwt-secret]} request]
  (let [username (get-in request [:json-params :username])
        password (get-in request [:json-params :password])
        cred (credentials/make-credentials username :mimo-dir mimo-dir)]
    (if-let [auth-token (credentials/generate-token cred password jwt-secret)]
      (let [created-at (credentials/created-at cred)]
        {:status 200 :body {:success true :data {:token auth-token :username username :createdAt created-at}}})
      {:status 200 :body {:success false :error "invalid credentials" :code 401}})))

(defn routes [& {:keys [mimo]}]
  #{["/greet" :get [coerce-body-interceptor
                    content-negotiation-interceptor
                    greet-handler] :route-name :greet]
    ["/api/internal/auth/login" :post [coerce-body-interceptor
                                       content-negotiation-interceptor
                                       (partial auth-login mimo)] :route-name :auth-login]}
  )

(defn create-connector [{:keys [http-port] :as mimo}]
  (-> (conn/default-connector-map http-port)
      (conn/with-default-interceptors)
      (conn/with-routes (routes {:mimo mimo}))
      (hk/create-connector nil)))

(defn -main [& _]
  (conn/start! (create-connector
                (make-mimo
                 :http-port (Integer/parseInt (System/getenv "PORT") 8890)
                 :mimo-dir (or (System/getenv "MIMO_HOME") "/home/app/.mimo")
                 :jwt-secret (or (System/getenv "JWT_SECRET") "secret")))))
