(ns mimo-platform.core
  (:require [io.pedestal.connector :as conn]
            [io.pedestal.http.http-kit :as hk]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
            [clj-yaml.core :as yaml]
            [io.pedestal.http.content-negotiation :as content-negotiation])
  (:import [org.mindrot.jbcrypt BCrypt]))

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

(defn load-credentials [username & {:keys [mimo-dir]}]
  "Read credentials for USERNAME"
  (let [credentials-path (format "%s/users/%s/credentials.yaml" mimo-dir username)
        credentials-content (slurp (io/file credentials-path))
        credentials (yaml/parse-string credentials-content)]
    credentials)
  )

(defn credentials-verify-password? [credentials password]
  (println (get credentials :passwordHash))
  (let [password-hash (get credentials :passwordHash)
        normalized-password-hash (clojure.string/replace password-hash #"^\$2b\$" (fn [_] "$2a$"))]
    (BCrypt/checkpw password normalized-password-hash))
  )

(defn auth-login [request]
  (let [username (get-in request [:json-params :username])
        password (get-in request [:json-params :password])
        credentials (load-credentials username :mimo-dir "/home/bit4bit/.mimo")
        ]
    (if (credentials-verify-password? credentials password)
      {:status 200 :body {:success true :data {:username username}}}
      {:status 200 :body {:success false :error "invalid credentials" :code 401}})))

(def routes
  #{["/greet" :get [coerce-body-interceptor
                    content-negotiation-interceptor
                    greet-handler] :route-name :greet]
    ["/api/internal/auth/login" :post [coerce-body-interceptor
                                       content-negotiation-interceptor
                                       auth-login] :route-name :auth-login]}
  )

(defn create-connector [& {:keys [port] :or {port 0}}]
  (-> (conn/default-connector-map port)
      (conn/with-default-interceptors)
      (conn/with-routes routes)
      (hk/create-connector nil)))

(defn -main [& _]
  (conn/start! (create-connector :port 8890)))
