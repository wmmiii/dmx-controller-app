load("@gazelle//:deps.bzl", "go_repository")

def go_dependencies():
    go_repository(
        name = "co_honnef_go_tools",
        build_external = "vendored",
        importpath = "honnef.co/go/tools",
        sum = "h1:/hemPrYIhOhy8zYrNj+069zDB68us2sMGsfkFJO0iZs=",
        version = "v0.0.0-20190523083050-ea95bdfd59fc",
    )
    go_repository(
        name = "com_github_burntsushi_toml",
        build_external = "vendored",
        importpath = "github.com/BurntSushi/toml",
        sum = "h1:WXkYYl6Yr3qBf1K79EBnL4mak0OimBfB0XUf9Vl28OQ=",
        version = "v0.3.1",
    )
    go_repository(
        name = "com_github_census_instrumentation_opencensus_proto",
        build_external = "vendored",
        importpath = "github.com/census-instrumentation/opencensus-proto",
        sum = "h1:iKLQ0xPNFxR/2hzXZMrBo8f1j86j5WHzznCCQxV/b8g=",
        version = "v0.4.1",
    )
    go_repository(
        name = "com_github_cespare_xxhash_v2",
        build_external = "vendored",
        importpath = "github.com/cespare/xxhash/v2",
        sum = "h1:DC2CZ1Ep5Y4k3ZQ899DldepgrayRUGE6BBZ/cd9Cj44=",
        version = "v2.2.0",
    )
    go_repository(
        name = "com_github_client9_misspell",
        build_external = "vendored",
        importpath = "github.com/client9/misspell",
        sum = "h1:ta993UF76GwbvJcIo3Y68y/M3WxlpEHPWIGDkJYwzJI=",
        version = "v0.3.4",
    )
    go_repository(
        name = "com_github_cncf_udpa_go",
        build_external = "vendored",
        importpath = "github.com/cncf/udpa/go",
        sum = "h1:QQ3GSy+MqSHxm/d8nCtnAiZdYFd45cYZPs8vOOIYKfk=",
        version = "v0.0.0-20220112060539-c52dc94e7fbe",
    )
    go_repository(
        name = "com_github_cncf_xds_go",
        build_external = "vendored",
        importpath = "github.com/cncf/xds/go",
        sum = "h1:/inchEIKaYC1Akx+H+gqO04wryn5h75LSazbRlnya1k=",
        version = "v0.0.0-20230607035331-e9ce68804cb4",
    )
    go_repository(
        name = "com_github_davecgh_go_spew",
        build_external = "vendored",
        importpath = "github.com/davecgh/go-spew",
        sum = "h1:vj9j/u1bqnvCEfJOwUhtlOARqs3+rkHYY13jYWTU97c=",
        version = "v1.1.1",
    )
    go_repository(
        name = "com_github_envoyproxy_go_control_plane",
        build_external = "vendored",
        importpath = "github.com/envoyproxy/go-control-plane",
        sum = "h1:wSUXTlLfiAQRWs2F+p+EKOY9rUyis1MyGqJ2DIk5HpM=",
        version = "v0.11.1",
    )
    go_repository(
        name = "com_github_envoyproxy_protoc_gen_validate",
        build_external = "vendored",
        importpath = "github.com/envoyproxy/protoc-gen-validate",
        sum = "h1:QkIBuU5k+x7/QXPvPPnWXWlCdaBFApVqftFV6k087DA=",
        version = "v1.0.2",
    )
    go_repository(
        name = "com_github_golang_glog",
        build_external = "vendored",
        importpath = "github.com/golang/glog",
        sum = "h1:DVjP2PbBOzHyzA+dn3WhHIq4NdVu3Q+pvivFICf/7fo=",
        version = "v1.1.2",
    )
    go_repository(
        name = "com_github_golang_groupcache",
        build_external = "vendored",
        importpath = "github.com/golang/groupcache",
        sum = "h1:oI5xCqsCo564l8iNU+DwB5epxmsaqB+rhGL0m5jtYqE=",
        version = "v0.0.0-20210331224755-41bb18bfe9da",
    )
    go_repository(
        name = "com_github_golang_mock",
        build_external = "vendored",
        importpath = "github.com/golang/mock",
        sum = "h1:G5FRp8JnTd7RQH5kemVNlMeyXQAztQ3mOWV95KxsXH8=",
        version = "v1.1.1",
    )
    go_repository(
        name = "com_github_golang_protobuf",
        build_external = "vendored",
        importpath = "github.com/golang/protobuf",
        sum = "h1:KhyjKVUg7Usr/dYsdSqoFveMYd5ko72D+zANwlG1mmg=",
        version = "v1.5.3",
    )
    go_repository(
        name = "com_github_golang_snappy",
        build_external = "vendored",
        importpath = "github.com/golang/snappy",
        sum = "h1:yAGX7huGHXlcLOEtBnF4w7FQwA26wojNCwOYAEhLjQM=",
        version = "v0.0.4",
    )
    go_repository(
        name = "com_github_google_go_cmp",
        build_external = "vendored",
        importpath = "github.com/google/go-cmp",
        sum = "h1:ofyhxvXcZhMsU5ulbFiLKl/XBFqE1GSq7atu8tAmTRI=",
        version = "v0.6.0",
    )
    go_repository(
        name = "com_github_google_go_pkcs11",
        build_external = "vendored",
        importpath = "github.com/google/go-pkcs11",
        sum = "h1:OF1IPgv+F4NmqmJ98KTjdN97Vs1JxDPB3vbmYzV2dpk=",
        version = "v0.2.1-0.20230907215043-c6f79328ddf9",
    )
    go_repository(
        name = "com_github_google_martian_v3",
        build_external = "vendored",
        importpath = "github.com/google/martian/v3",
        sum = "h1:IqNFLAmvJOgVlpdEBiQbDc2EwKW77amAycfTuWKdfvw=",
        version = "v3.3.2",
    )
    go_repository(
        name = "com_github_google_s2a_go",
        build_external = "vendored",
        importpath = "github.com/google/s2a-go",
        sum = "h1:60BLSyTrOV4/haCDW4zb1guZItoSq8foHCXrAnjBo/o=",
        version = "v0.1.7",
    )
    go_repository(
        name = "com_github_google_uuid",
        build_external = "vendored",
        importpath = "github.com/google/uuid",
        sum = "h1:MtMxsa51/r9yyhkyLsVeVt0B+BGQZzpQiTQ4eHZ8bc4=",
        version = "v1.4.0",
    )
    go_repository(
        name = "com_github_googleapis_enterprise_certificate_proxy",
        build_external = "vendored",
        importpath = "github.com/googleapis/enterprise-certificate-proxy",
        sum = "h1:Vie5ybvEvT75RniqhfFxPRy3Bf7vr3h0cechB90XaQs=",
        version = "v0.3.2",
    )
    go_repository(
        name = "com_github_googleapis_gax_go_v2",
        build_external = "vendored",
        importpath = "github.com/googleapis/gax-go/v2",
        sum = "h1:A+gCJKdRfqXkr+BIRGtZLibNXf0m1f9E4HG56etFpas=",
        version = "v2.12.0",
    )
    go_repository(
        name = "com_github_nfnt_resize",
        importpath = "github.com/nfnt/resize",
        sum = "h1:zYyBkD/k9seD2A7fsi6Oo2LfFZAehjjQMERAvZLEDnQ=",
        version = "v0.0.0-20180221191011-83c6a9932646",
    )
    go_repository(
        name = "com_github_pmezard_go_difflib",
        build_external = "vendored",
        importpath = "github.com/pmezard/go-difflib",
        sum = "h1:4DBwDE0NGyQoBHbLQYPwSUPoCMWR5BEzIk/f1lZbAQM=",
        version = "v1.0.0",
    )
    go_repository(
        name = "com_github_prometheus_client_model",
        build_external = "vendored",
        importpath = "github.com/prometheus/client_model",
        sum = "h1:gQz4mCbXsO+nc9n1hCxHcGA3Zx3Eo+UHZoInFGUIXNM=",
        version = "v0.0.0-20190812154241-14fe0d1b01d4",
    )
    go_repository(
        name = "com_github_stretchr_objx",
        build_external = "vendored",
        importpath = "github.com/stretchr/objx",
        sum = "h1:1zr/of2m5FGMsad5YfcqgdqdWrIhu+EBEJRhR1U7z/c=",
        version = "v0.5.0",
    )
    go_repository(
        name = "com_github_stretchr_testify",
        build_external = "vendored",
        importpath = "github.com/stretchr/testify",
        sum = "h1:w7B6lhMri9wdJUVmEZPGGhZzrYTPvgJArz7wNPgYKsk=",
        version = "v1.8.1",
    )
    go_repository(
        name = "com_google_cloud_go",
        build_external = "vendored",
        importpath = "cloud.google.com/go",
        sum = "h1:tyNdfIxjzaWctIiLYOTalaLKZ17SI44SKFW26QbOhME=",
        version = "v0.110.8",
    )
    go_repository(
        name = "com_google_cloud_go_accessapproval",
        build_external = "vendored",
        importpath = "cloud.google.com/go/accessapproval",
        sum = "h1:W55SFrY6EVlcmmRGUk0rGhuy3j4fn7UtEocib/zADVE=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_accesscontextmanager",
        build_external = "vendored",
        importpath = "cloud.google.com/go/accesscontextmanager",
        sum = "h1:jcOXen2u13aHgOHibUjxyPI+fZzVhElxy2gzJJlOOHg=",
        version = "v1.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_aiplatform",
        build_external = "vendored",
        importpath = "cloud.google.com/go/aiplatform",
        sum = "h1:g+y03dll9HnX9U0oBKIqUOI+8VQWT1QJF12VGxkal0Q=",
        version = "v1.51.1",
    )
    go_repository(
        name = "com_google_cloud_go_analytics",
        build_external = "vendored",
        importpath = "cloud.google.com/go/analytics",
        sum = "h1:SScWR8i/M8h7h3lFKtOYcj0r4272aL+KvRRrsu39Vec=",
        version = "v0.21.4",
    )
    go_repository(
        name = "com_google_cloud_go_apigateway",
        build_external = "vendored",
        importpath = "cloud.google.com/go/apigateway",
        sum = "h1:I46jVrhr2M1JJ1lK7JGn2BvybN44muEh+LSjBQ1l9hw=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_apigeeconnect",
        build_external = "vendored",
        importpath = "cloud.google.com/go/apigeeconnect",
        sum = "h1:7LzOTW34EH2julg0MQVt+U9ZdmiCKcg6fef/ugKL2Xo=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_apigeeregistry",
        build_external = "vendored",
        importpath = "cloud.google.com/go/apigeeregistry",
        sum = "h1:MESEjKSfz4TvLAzT2KPimDDvhOyQlcq7aFFREG2PRt4=",
        version = "v0.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_appengine",
        build_external = "vendored",
        importpath = "cloud.google.com/go/appengine",
        sum = "h1:0/OFV0FQKgi0AB4E8NuYN0JY3hJzND4ftRpK7P26uaw=",
        version = "v1.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_area120",
        build_external = "vendored",
        importpath = "cloud.google.com/go/area120",
        sum = "h1:h/wMtPPsgFJfMce1b9M24Od8RuKt8CWENwr+X24tBhE=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_artifactregistry",
        build_external = "vendored",
        importpath = "cloud.google.com/go/artifactregistry",
        sum = "h1:Ssv6f+jgfhDdhu43AaHUaSosIYpQ+TPCJNwqYSJT1AE=",
        version = "v1.14.3",
    )
    go_repository(
        name = "com_google_cloud_go_asset",
        build_external = "vendored",
        importpath = "cloud.google.com/go/asset",
        sum = "h1:+9f5/s/U0AGZSPLTOMcXSZ5NDB5jQ2Szr+WQPgPA8bk=",
        version = "v1.15.1",
    )
    go_repository(
        name = "com_google_cloud_go_assuredworkloads",
        build_external = "vendored",
        importpath = "cloud.google.com/go/assuredworkloads",
        sum = "h1:EbPyk3fC8sTxSIPoFrCR9P1wRTVdXcRxvPqFK8/wdso=",
        version = "v1.11.2",
    )
    go_repository(
        name = "com_google_cloud_go_automl",
        build_external = "vendored",
        importpath = "cloud.google.com/go/automl",
        sum = "h1:kUN4Y6N61AsNdXsdZIug1c+2pTJ5tg9xUA6+yn0Wf8Y=",
        version = "v1.13.2",
    )
    go_repository(
        name = "com_google_cloud_go_baremetalsolution",
        build_external = "vendored",
        importpath = "cloud.google.com/go/baremetalsolution",
        sum = "h1:uRpZsKiWFDyT1sARZVRKqnOmf2mpRfVas7KMC3/MA4I=",
        version = "v1.2.1",
    )
    go_repository(
        name = "com_google_cloud_go_batch",
        build_external = "vendored",
        importpath = "cloud.google.com/go/batch",
        sum = "h1:+8ZogCLFauglOE5ybTCWscoexD7Z8k4XW27RVTKNEoo=",
        version = "v1.5.1",
    )
    go_repository(
        name = "com_google_cloud_go_beyondcorp",
        build_external = "vendored",
        importpath = "cloud.google.com/go/beyondcorp",
        sum = "h1:uQpsXwttlV0+AXHdB5qaZl1mz2SsyYV1PKgTR74noaQ=",
        version = "v1.0.1",
    )
    go_repository(
        name = "com_google_cloud_go_bigquery",
        build_external = "vendored",
        importpath = "cloud.google.com/go/bigquery",
        sum = "h1:LHIc9E7Kw+ftFpQFKzZYBB88IAFz7qONawXXx0F3QBo=",
        version = "v1.56.0",
    )
    go_repository(
        name = "com_google_cloud_go_billing",
        build_external = "vendored",
        importpath = "cloud.google.com/go/billing",
        sum = "h1:ozS/MNj6KKz8Reuw7tIG8Ycucq/YpSf3u3XCqrupbcg=",
        version = "v1.17.2",
    )
    go_repository(
        name = "com_google_cloud_go_binaryauthorization",
        build_external = "vendored",
        importpath = "cloud.google.com/go/binaryauthorization",
        sum = "h1:i2S+/G36VA1UG8gdcQLpq5I58/w/RzAnjQ65scKozFg=",
        version = "v1.7.1",
    )
    go_repository(
        name = "com_google_cloud_go_certificatemanager",
        build_external = "vendored",
        importpath = "cloud.google.com/go/certificatemanager",
        sum = "h1:Xytp8O0/EDh2nVscHhFQpicY9YAT3f3R7D7pv/z29uE=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_channel",
        build_external = "vendored",
        importpath = "cloud.google.com/go/channel",
        sum = "h1:+1B+Gj/3SJSLGJZXCp3dWiseMVHoSZ7Xo6Klg1fqM64=",
        version = "v1.17.1",
    )
    go_repository(
        name = "com_google_cloud_go_cloudbuild",
        build_external = "vendored",
        importpath = "cloud.google.com/go/cloudbuild",
        sum = "h1:Tp0ITIlFam7T8K/TyeceITtpw1f8+KxVKwYyiyWDPK8=",
        version = "v1.14.1",
    )
    go_repository(
        name = "com_google_cloud_go_clouddms",
        build_external = "vendored",
        importpath = "cloud.google.com/go/clouddms",
        sum = "h1:LrtqeR2xKV3juG5N7eeUgW+PqdMClOWH2U9PN3EpfFw=",
        version = "v1.7.1",
    )
    go_repository(
        name = "com_google_cloud_go_cloudtasks",
        build_external = "vendored",
        importpath = "cloud.google.com/go/cloudtasks",
        sum = "h1:IoJI49JClvv2+NYvcABRgTO9y4veAUFlaOTigm+xXqE=",
        version = "v1.12.2",
    )
    go_repository(
        name = "com_google_cloud_go_compute",
        build_external = "vendored",
        importpath = "cloud.google.com/go/compute",
        sum = "h1:V97tBoDaZHb6leicZ1G6DLK2BAaZLJ/7+9BB/En3hR0=",
        version = "v1.23.1",
    )
    go_repository(
        name = "com_google_cloud_go_compute_metadata",
        build_external = "vendored",
        importpath = "cloud.google.com/go/compute/metadata",
        sum = "h1:mg4jlk7mCAj6xXp9UJ4fjI9VUI5rubuGBW5aJ7UnBMY=",
        version = "v0.2.3",
    )
    go_repository(
        name = "com_google_cloud_go_contactcenterinsights",
        build_external = "vendored",
        importpath = "cloud.google.com/go/contactcenterinsights",
        sum = "h1:dEfCjtdYjS3n8/1HEKbJaOL31l3dEs3q9aeaNsyrJBc=",
        version = "v1.11.1",
    )
    go_repository(
        name = "com_google_cloud_go_container",
        build_external = "vendored",
        importpath = "cloud.google.com/go/container",
        sum = "h1:1CXjOL/dZZ2jXX1CYWqlxmXqJbZo8HwQX4DJxLzgQWo=",
        version = "v1.26.1",
    )
    go_repository(
        name = "com_google_cloud_go_containeranalysis",
        build_external = "vendored",
        importpath = "cloud.google.com/go/containeranalysis",
        sum = "h1:PHh4KTcMpCjYgxfV+TzvP24wolTGP9lGbqh9sBNHxjs=",
        version = "v0.11.1",
    )
    go_repository(
        name = "com_google_cloud_go_datacatalog",
        build_external = "vendored",
        importpath = "cloud.google.com/go/datacatalog",
        sum = "h1:xJp9mZrc2HPaoxIz3sP9pCmf/impifweQ/yGG9VBfio=",
        version = "v1.18.1",
    )
    go_repository(
        name = "com_google_cloud_go_dataflow",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dataflow",
        sum = "h1:cpu2OeNxnYVadAIXETLRS5riz3KUR8ErbTojAQTFJVg=",
        version = "v0.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_dataform",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dataform",
        sum = "h1:l155O3DS7pfyR91maS4l92bEjKbkbWie3dpgltZ1Q68=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_datafusion",
        build_external = "vendored",
        importpath = "cloud.google.com/go/datafusion",
        sum = "h1:CIIXp4bbwck49ZTV/URabJaV48jVB86THyVBWGgeDjw=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_datalabeling",
        build_external = "vendored",
        importpath = "cloud.google.com/go/datalabeling",
        sum = "h1:4N5mbjauemzaatxGOFVpV2i8HiXSUUhyNRBU+dCBHl0=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_dataplex",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dataplex",
        sum = "h1:8Irss8sIalm/X8r0Masv5KJRkddcxov3TiW8W96FmC4=",
        version = "v1.10.1",
    )
    go_repository(
        name = "com_google_cloud_go_dataproc_v2",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dataproc/v2",
        sum = "h1:BPjIIkTCAOHUkMtWKqae55qEku5K09LVbQ46LYt7r1s=",
        version = "v2.2.1",
    )
    go_repository(
        name = "com_google_cloud_go_dataqna",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dataqna",
        sum = "h1:vJ9JVKDgDG7AQMbTD8pdWaogJ4c/yHn0qer+q0nFIaw=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_datastore",
        build_external = "vendored",
        importpath = "cloud.google.com/go/datastore",
        sum = "h1:0P9WcsQeTWjuD1H14JIY7XQscIPQ4Laje8ti96IC5vg=",
        version = "v1.15.0",
    )
    go_repository(
        name = "com_google_cloud_go_datastream",
        build_external = "vendored",
        importpath = "cloud.google.com/go/datastream",
        sum = "h1:XWiXV1hzs8oAd54//wcb1L15Jl7MnZ/cY2B8XCmu0xE=",
        version = "v1.10.1",
    )
    go_repository(
        name = "com_google_cloud_go_deploy",
        build_external = "vendored",
        importpath = "cloud.google.com/go/deploy",
        sum = "h1:eV5MdoQJGdac/k7D97SDjD8iLE4jCzL42UCAgG6j0iE=",
        version = "v1.13.1",
    )
    go_repository(
        name = "com_google_cloud_go_dialogflow",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dialogflow",
        sum = "h1:Ml/hgEzU3AN0tjNSSv4/QmG1nqwYEsiCySKMkWMqUmI=",
        version = "v1.44.1",
    )
    go_repository(
        name = "com_google_cloud_go_dlp",
        build_external = "vendored",
        importpath = "cloud.google.com/go/dlp",
        sum = "h1:sWOATigjZOKmA2rVOSjIcKLCtL2ifdawaukx+H9iffk=",
        version = "v1.10.2",
    )
    go_repository(
        name = "com_google_cloud_go_documentai",
        build_external = "vendored",
        importpath = "cloud.google.com/go/documentai",
        sum = "h1:IAKWBngDFTxABdAH52uAn0osPDemyegyRmf5IQKznHw=",
        version = "v1.23.2",
    )
    go_repository(
        name = "com_google_cloud_go_domains",
        build_external = "vendored",
        importpath = "cloud.google.com/go/domains",
        sum = "h1:SjpTtaTNRPPajrGiZEtxz9dpElO4PxuDWFvU4JpV1gk=",
        version = "v0.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_edgecontainer",
        build_external = "vendored",
        importpath = "cloud.google.com/go/edgecontainer",
        sum = "h1:B+Acb/0frXUxc60i6lC0JtXrBFAKoS7ZELmet9+ySo8=",
        version = "v1.1.2",
    )
    go_repository(
        name = "com_google_cloud_go_errorreporting",
        build_external = "vendored",
        importpath = "cloud.google.com/go/errorreporting",
        sum = "h1:kj1XEWMu8P0qlLhm3FwcaFsUvXChV/OraZwA70trRR0=",
        version = "v0.3.0",
    )
    go_repository(
        name = "com_google_cloud_go_essentialcontacts",
        build_external = "vendored",
        importpath = "cloud.google.com/go/essentialcontacts",
        sum = "h1:xrGTLRTzunQk5XhBIkdftuC00B9MUoEXi7Pjgeu1kMM=",
        version = "v1.6.3",
    )
    go_repository(
        name = "com_google_cloud_go_eventarc",
        build_external = "vendored",
        importpath = "cloud.google.com/go/eventarc",
        sum = "h1:FmEcxG5rX3LaUB2nRjf2Pas5J5TtVrVznaHN5rxYxnQ=",
        version = "v1.13.1",
    )
    go_repository(
        name = "com_google_cloud_go_filestore",
        build_external = "vendored",
        importpath = "cloud.google.com/go/filestore",
        sum = "h1:/Nnk5pOoY1Lx6A42hJ2eBYcBfqKvLcnh8fV4egopvY4=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_firestore",
        build_external = "vendored",
        importpath = "cloud.google.com/go/firestore",
        sum = "h1:/3S4RssUV4GO/kvgJZB+tayjhOfyAHs+KcpJgRVu/Qk=",
        version = "v1.13.0",
    )
    go_repository(
        name = "com_google_cloud_go_functions",
        build_external = "vendored",
        importpath = "cloud.google.com/go/functions",
        sum = "h1:DpT51zU3UMTt64efB4a9hE9B98Kb0fZC3IfaVp7GnkE=",
        version = "v1.15.2",
    )
    go_repository(
        name = "com_google_cloud_go_gkebackup",
        build_external = "vendored",
        importpath = "cloud.google.com/go/gkebackup",
        sum = "h1:1fnA934a/0oz7nU22gTzmGYFVi6V13Q/hCkdC99K178=",
        version = "v1.3.2",
    )
    go_repository(
        name = "com_google_cloud_go_gkeconnect",
        build_external = "vendored",
        importpath = "cloud.google.com/go/gkeconnect",
        sum = "h1:AuR3YNK0DgLVrmcc8o4sBrU0dVs/SULSuLh4Gmn1e10=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_gkehub",
        build_external = "vendored",
        importpath = "cloud.google.com/go/gkehub",
        sum = "h1:7rddjV52z0RbToFYj1B39R9dsn+6IXgx4DduEH7N25Q=",
        version = "v0.14.2",
    )
    go_repository(
        name = "com_google_cloud_go_gkemulticloud",
        build_external = "vendored",
        importpath = "cloud.google.com/go/gkemulticloud",
        sum = "h1:V82LxEvFIGJnebn7BBdOUKcVlNQqBaubbKtLgRicHow=",
        version = "v1.0.1",
    )
    go_repository(
        name = "com_google_cloud_go_gsuiteaddons",
        build_external = "vendored",
        importpath = "cloud.google.com/go/gsuiteaddons",
        sum = "h1:vR7E1gR85x0wlbUek3cZYJ67U67GpNrboNCRiF/VSSc=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_iam",
        build_external = "vendored",
        importpath = "cloud.google.com/go/iam",
        sum = "h1:18tKG7DzydKWUnLjonWcJO6wjSCAtzh4GcRKlH/Hrzc=",
        version = "v1.1.3",
    )
    go_repository(
        name = "com_google_cloud_go_iap",
        build_external = "vendored",
        importpath = "cloud.google.com/go/iap",
        sum = "h1:J5r6CL6EakRmsMRIm2yV0PF5zfIm4sMQbQfPhSTnRzA=",
        version = "v1.9.1",
    )
    go_repository(
        name = "com_google_cloud_go_ids",
        build_external = "vendored",
        importpath = "cloud.google.com/go/ids",
        sum = "h1:KqvR28pAnIss6d2pmGOQ+Fcsi3FOWDVhqdr6QaVvqsI=",
        version = "v1.4.2",
    )
    go_repository(
        name = "com_google_cloud_go_iot",
        build_external = "vendored",
        importpath = "cloud.google.com/go/iot",
        sum = "h1:qFNv3teWkONIPmuY2mzodEnHb6E67ch2OZ6216ycUiU=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_kms",
        build_external = "vendored",
        importpath = "cloud.google.com/go/kms",
        sum = "h1:RYsbxTRmk91ydKCzekI2YjryO4c5Y2M80Zwcs9/D/cI=",
        version = "v1.15.3",
    )
    go_repository(
        name = "com_google_cloud_go_language",
        build_external = "vendored",
        importpath = "cloud.google.com/go/language",
        sum = "h1:BjU7Ljhh0ZYnZC8jZwiezf1FH75yijJ4raAScseqCns=",
        version = "v1.11.1",
    )
    go_repository(
        name = "com_google_cloud_go_lifesciences",
        build_external = "vendored",
        importpath = "cloud.google.com/go/lifesciences",
        sum = "h1:0naTq5qUWoRt/b5P+SZ/0mun7ZTlhpJZJsUxhCmLv1c=",
        version = "v0.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_logging",
        build_external = "vendored",
        importpath = "cloud.google.com/go/logging",
        sum = "h1:26skQWPeYhvIasWKm48+Eq7oUqdcdbwsCVwz5Ys0FvU=",
        version = "v1.8.1",
    )
    go_repository(
        name = "com_google_cloud_go_longrunning",
        build_external = "vendored",
        importpath = "cloud.google.com/go/longrunning",
        sum = "h1:u+oFqfEwwU7F9dIELigxbe0XVnBAo9wqMuQLA50CZ5k=",
        version = "v0.5.2",
    )
    go_repository(
        name = "com_google_cloud_go_managedidentities",
        build_external = "vendored",
        importpath = "cloud.google.com/go/managedidentities",
        sum = "h1:QijSmmWHb3EzYQr8SrjWe941ba9G5sTCF5PvhhMM8CM=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_maps",
        build_external = "vendored",
        importpath = "cloud.google.com/go/maps",
        sum = "h1:/wp8wImC3tHIHOoaQGRA+KyH3as/Dvp+3J/NqJQBiPQ=",
        version = "v1.4.1",
    )
    go_repository(
        name = "com_google_cloud_go_mediatranslation",
        build_external = "vendored",
        importpath = "cloud.google.com/go/mediatranslation",
        sum = "h1:nyBZbNX1j34H00n+irnQraCogrkRWntQsDoA6s8OfKo=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_memcache",
        build_external = "vendored",
        importpath = "cloud.google.com/go/memcache",
        sum = "h1:WLJALO3FxuStMiYdSQwiQBDBcs4G8DDwZQmXK+YzAWk=",
        version = "v1.10.2",
    )
    go_repository(
        name = "com_google_cloud_go_metastore",
        build_external = "vendored",
        importpath = "cloud.google.com/go/metastore",
        sum = "h1:tLemzNMjKY+xdJUDQt9v5+fQqSufTNgKHHQmihG5ay8=",
        version = "v1.13.1",
    )
    go_repository(
        name = "com_google_cloud_go_monitoring",
        build_external = "vendored",
        importpath = "cloud.google.com/go/monitoring",
        sum = "h1:CTklIuUkS5nCricGojPwdkSgPsCTX2HmYTxFDg+UvpU=",
        version = "v1.16.1",
    )
    go_repository(
        name = "com_google_cloud_go_networkconnectivity",
        build_external = "vendored",
        importpath = "cloud.google.com/go/networkconnectivity",
        sum = "h1:uR+ASueYNodsPCd9wcYEedqjH4+LaCkKqltRBF6CmB4=",
        version = "v1.14.1",
    )
    go_repository(
        name = "com_google_cloud_go_networkmanagement",
        build_external = "vendored",
        importpath = "cloud.google.com/go/networkmanagement",
        sum = "h1:ZK6i6FVQNc1t3fecM3hf9Nu6Kr9C95xr+zMVORYd8ak=",
        version = "v1.9.1",
    )
    go_repository(
        name = "com_google_cloud_go_networksecurity",
        build_external = "vendored",
        importpath = "cloud.google.com/go/networksecurity",
        sum = "h1:fA73AX//KWaqNKOvuQ00WUD3Z/XMhiMhHSFTEl2Wxec=",
        version = "v0.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_notebooks",
        build_external = "vendored",
        importpath = "cloud.google.com/go/notebooks",
        sum = "h1:j/G3r6SPoWzD6CZZrDffZGwgGALvxWwtKJHJ4GF17WA=",
        version = "v1.10.1",
    )
    go_repository(
        name = "com_google_cloud_go_optimization",
        build_external = "vendored",
        importpath = "cloud.google.com/go/optimization",
        sum = "h1:71wTxJz8gRrVEHF4fw18sGynAyNQwatxCJBI3m3Rd4c=",
        version = "v1.5.1",
    )
    go_repository(
        name = "com_google_cloud_go_orchestration",
        build_external = "vendored",
        importpath = "cloud.google.com/go/orchestration",
        sum = "h1:lb+Vphr+x2V9ukHwLjyaXJpbPuPhaKdobQx3UAOeSsQ=",
        version = "v1.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_orgpolicy",
        build_external = "vendored",
        importpath = "cloud.google.com/go/orgpolicy",
        sum = "h1:Dnfh5sj3aIAuJzH4Q4rBp6lCJ/IdXRBbwQ0/nQsUySE=",
        version = "v1.11.2",
    )
    go_repository(
        name = "com_google_cloud_go_osconfig",
        build_external = "vendored",
        importpath = "cloud.google.com/go/osconfig",
        sum = "h1:AjHbw8MgKKaTFAEJWGdOYtMED3wUXKLtvdfP8Uzbuy0=",
        version = "v1.12.2",
    )
    go_repository(
        name = "com_google_cloud_go_oslogin",
        build_external = "vendored",
        importpath = "cloud.google.com/go/oslogin",
        sum = "h1:r3JYeLf004krfXhRMDfYKlBdMgDDc2q2PM1bomb5Luw=",
        version = "v1.11.1",
    )
    go_repository(
        name = "com_google_cloud_go_phishingprotection",
        build_external = "vendored",
        importpath = "cloud.google.com/go/phishingprotection",
        sum = "h1:BIv/42ooQXh/jW8BW2cgO0E6yRPbEdvqH3JzKV7BlmI=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_policytroubleshooter",
        build_external = "vendored",
        importpath = "cloud.google.com/go/policytroubleshooter",
        sum = "h1:92YSoPZE62QkNM0G6Nl6PICKUyv4aNgsdtWWceJR6ys=",
        version = "v1.9.1",
    )
    go_repository(
        name = "com_google_cloud_go_privatecatalog",
        build_external = "vendored",
        importpath = "cloud.google.com/go/privatecatalog",
        sum = "h1:gxL4Kn9IXt3tdIOpDPEDPI/kBBLVzaAX5wq6IbOYi8A=",
        version = "v0.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_pubsub",
        build_external = "vendored",
        importpath = "cloud.google.com/go/pubsub",
        sum = "h1:6SPCPvWav64tj0sVX/+npCBKhUi/UjJehy9op/V3p2g=",
        version = "v1.33.0",
    )
    go_repository(
        name = "com_google_cloud_go_pubsublite",
        build_external = "vendored",
        importpath = "cloud.google.com/go/pubsublite",
        sum = "h1:pX+idpWMIH30/K7c0epN6V703xpIcMXWRjKJsz0tYGY=",
        version = "v1.8.1",
    )
    go_repository(
        name = "com_google_cloud_go_recaptchaenterprise_v2",
        build_external = "vendored",
        importpath = "cloud.google.com/go/recaptchaenterprise/v2",
        sum = "h1:06V6+edT20PcrFJfH0TVWMZpZCUpSCADgwGwhkMsGmY=",
        version = "v2.8.1",
    )
    go_repository(
        name = "com_google_cloud_go_recommendationengine",
        build_external = "vendored",
        importpath = "cloud.google.com/go/recommendationengine",
        sum = "h1:odf0TZXtwoZ5kJaWBlaE9D0AV+WJLLs+/SRSuE4T/ds=",
        version = "v0.8.2",
    )
    go_repository(
        name = "com_google_cloud_go_recommender",
        build_external = "vendored",
        importpath = "cloud.google.com/go/recommender",
        sum = "h1:GI4EBCMTLfC8I8R+e13ZaTAa8ZZ0KRPdS99hGtJYyaU=",
        version = "v1.11.1",
    )
    go_repository(
        name = "com_google_cloud_go_redis",
        build_external = "vendored",
        importpath = "cloud.google.com/go/redis",
        sum = "h1:2ZtIGspMT65wern2rjX35XPCCJxVKF4J0P1S99bac3k=",
        version = "v1.13.2",
    )
    go_repository(
        name = "com_google_cloud_go_resourcemanager",
        build_external = "vendored",
        importpath = "cloud.google.com/go/resourcemanager",
        sum = "h1:lC3PjJMHLPlZKqLfan6FkEb3X1F8oCRc1ylY7vRHvDQ=",
        version = "v1.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_resourcesettings",
        build_external = "vendored",
        importpath = "cloud.google.com/go/resourcesettings",
        sum = "h1:feqx2EcLRgtmwNHzeLw5Og4Wcy4vcZxw62b0x/QNu60=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_retail",
        build_external = "vendored",
        importpath = "cloud.google.com/go/retail",
        sum = "h1:ed5hWjpOwfsi6E9kj2AFzkz5ScT3aZs7o3MUM0YITUM=",
        version = "v1.14.2",
    )
    go_repository(
        name = "com_google_cloud_go_run",
        build_external = "vendored",
        importpath = "cloud.google.com/go/run",
        sum = "h1:xc46W9kxJI2De9hmpqHEBSSLJhP3bSZl86LdlJa5zm8=",
        version = "v1.3.1",
    )
    go_repository(
        name = "com_google_cloud_go_scheduler",
        build_external = "vendored",
        importpath = "cloud.google.com/go/scheduler",
        sum = "h1:lgUd1D84JEgNzzHRlcZEIoQ6Ny10YWe8RNH1knhouNk=",
        version = "v1.10.2",
    )
    go_repository(
        name = "com_google_cloud_go_secretmanager",
        build_external = "vendored",
        importpath = "cloud.google.com/go/secretmanager",
        sum = "h1:52Z78hH8NBWIqbvIG0wi0EoTaAmSx99KIOAmDXIlX0M=",
        version = "v1.11.2",
    )
    go_repository(
        name = "com_google_cloud_go_security",
        build_external = "vendored",
        importpath = "cloud.google.com/go/security",
        sum = "h1:VNpdJNfMeHSJZ+647QtzPrvZ6rWChBklLm/NY64RVW8=",
        version = "v1.15.2",
    )
    go_repository(
        name = "com_google_cloud_go_securitycenter",
        build_external = "vendored",
        importpath = "cloud.google.com/go/securitycenter",
        sum = "h1:Epx7Gm9ZRPRiFfwDFplka2zKCS0J3cpm0Et1KwI2tvY=",
        version = "v1.23.1",
    )
    go_repository(
        name = "com_google_cloud_go_servicedirectory",
        build_external = "vendored",
        importpath = "cloud.google.com/go/servicedirectory",
        sum = "h1:SXhbxsfQJBsUDeo743x5AnVe8ifC7qjXU3bSTT6t/+Q=",
        version = "v1.11.1",
    )
    go_repository(
        name = "com_google_cloud_go_shell",
        build_external = "vendored",
        importpath = "cloud.google.com/go/shell",
        sum = "h1:zk0Cf2smbFlAdhBQ5tXESZzzmsTfGc31fJfI6a0SVD8=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_spanner",
        build_external = "vendored",
        importpath = "cloud.google.com/go/spanner",
        sum = "h1:QrJFOpaxCXdXF+GkiruLz642PHxkdj68PbbnLw3O2Zw=",
        version = "v1.50.0",
    )
    go_repository(
        name = "com_google_cloud_go_speech",
        build_external = "vendored",
        importpath = "cloud.google.com/go/speech",
        sum = "h1:z035FMLs98jpnqcP5xZZ6Es+g6utbeVoUH64BaTzTSU=",
        version = "v1.19.1",
    )
    go_repository(
        name = "com_google_cloud_go_storage",
        build_external = "vendored",
        importpath = "cloud.google.com/go/storage",
        sum = "h1:P0mOkAcaJxhCTvAkMhxMfrTKiNcub4YmmPBtlhAyTr8=",
        version = "v1.36.0",
    )
    go_repository(
        name = "com_google_cloud_go_storagetransfer",
        build_external = "vendored",
        importpath = "cloud.google.com/go/storagetransfer",
        sum = "h1:CU03oYLauu7xRV25fFmozHZHA/SokLQlC20Ip/UvFro=",
        version = "v1.10.1",
    )
    go_repository(
        name = "com_google_cloud_go_talent",
        build_external = "vendored",
        importpath = "cloud.google.com/go/talent",
        sum = "h1:TyJqwhmncdW5CL4rzYSYKJrR9YAe0iNqHtJTnnOaEyM=",
        version = "v1.6.3",
    )
    go_repository(
        name = "com_google_cloud_go_texttospeech",
        build_external = "vendored",
        importpath = "cloud.google.com/go/texttospeech",
        sum = "h1:Ac53sRkUo8UMSuhyyWRFJvWEaX8vm0EFwwiTAxeVYuU=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_tpu",
        build_external = "vendored",
        importpath = "cloud.google.com/go/tpu",
        sum = "h1:SAFzyGp6mU37lfLTV0cNQwu7tqH4X8b4RCpQZ1s+mYM=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_trace",
        build_external = "vendored",
        importpath = "cloud.google.com/go/trace",
        sum = "h1:80Rh4JSqJLfe/xGNrpyO4MQxiFDXcHG1XrsevfmrIRQ=",
        version = "v1.10.2",
    )
    go_repository(
        name = "com_google_cloud_go_translate",
        build_external = "vendored",
        importpath = "cloud.google.com/go/translate",
        sum = "h1:gNPBVMINs+aZMB8BW+IfrHLLTfdq0t0GMwa31NmOXY4=",
        version = "v1.9.1",
    )
    go_repository(
        name = "com_google_cloud_go_video",
        build_external = "vendored",
        importpath = "cloud.google.com/go/video",
        sum = "h1:yMfxQ4N/fXNDsCKNKw9W+FpdrJPj5CDu+FuAJBmGuoo=",
        version = "v1.20.1",
    )
    go_repository(
        name = "com_google_cloud_go_videointelligence",
        build_external = "vendored",
        importpath = "cloud.google.com/go/videointelligence",
        sum = "h1:vAKuM4YHwZy1W5P7hGJdfXriovqHHUZKhDBq8o4nqfg=",
        version = "v1.11.2",
    )
    go_repository(
        name = "com_google_cloud_go_vision_v2",
        build_external = "vendored",
        importpath = "cloud.google.com/go/vision/v2",
        sum = "h1:o8iiH4UsI6O8wO2Ax2r88fLG1RzYQIFevUQY7hXPZeM=",
        version = "v2.7.3",
    )
    go_repository(
        name = "com_google_cloud_go_vmmigration",
        build_external = "vendored",
        importpath = "cloud.google.com/go/vmmigration",
        sum = "h1:ObE8VWzL+xkU22IsPEMvPCWArnSQ85dEwR5fzgaOvA4=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_vmwareengine",
        build_external = "vendored",
        importpath = "cloud.google.com/go/vmwareengine",
        sum = "h1:Bj9WECvQk1fkx8IG7gqII3+g1CzhqkPOV84WXvifpFg=",
        version = "v1.0.1",
    )
    go_repository(
        name = "com_google_cloud_go_vpcaccess",
        build_external = "vendored",
        importpath = "cloud.google.com/go/vpcaccess",
        sum = "h1:3qKiWvzK07eIa943mCvkcZB4gimxaQKKGdNoX01ps7A=",
        version = "v1.7.2",
    )
    go_repository(
        name = "com_google_cloud_go_webrisk",
        build_external = "vendored",
        importpath = "cloud.google.com/go/webrisk",
        sum = "h1:1NZppagzdGO0hVMJsUhZQ5a3Iu2cNyNObu85VFcvIVA=",
        version = "v1.9.2",
    )
    go_repository(
        name = "com_google_cloud_go_websecurityscanner",
        build_external = "vendored",
        importpath = "cloud.google.com/go/websecurityscanner",
        sum = "h1:V7PhbJ2OvpGHINL67RBhpwU3+g4MOoqOeL/sFYrogeE=",
        version = "v1.6.2",
    )
    go_repository(
        name = "com_google_cloud_go_workflows",
        build_external = "vendored",
        importpath = "cloud.google.com/go/workflows",
        sum = "h1:jvhSfcfAoOt0nILm7aZPJAHdpoe571qrJyc2ZlngaJk=",
        version = "v1.12.1",
    )
    go_repository(
        name = "in_gopkg_check_v1",
        build_external = "vendored",
        importpath = "gopkg.in/check.v1",
        sum = "h1:yhCVgyC4o1eVCa2tZl7eS0r+SDo693bJlVdllGtEeKM=",
        version = "v0.0.0-20161208181325-20d25e280405",
    )
    go_repository(
        name = "in_gopkg_yaml_v3",
        build_external = "vendored",
        importpath = "gopkg.in/yaml.v3",
        sum = "h1:fxVm/GzAzEWqLHuvctI91KS9hhNmmWOoWu0XTYJS7CA=",
        version = "v3.0.1",
    )
    go_repository(
        name = "io_opencensus_go",
        build_external = "vendored",
        importpath = "go.opencensus.io",
        sum = "h1:y73uSU6J157QMP2kn2r30vwW1A2W2WFwSCGnAVxeaD0=",
        version = "v0.24.0",
    )
    go_repository(
        name = "org_golang_google_api",
        build_external = "vendored",
        importpath = "google.golang.org/api",
        sum = "h1:Z9k22qD289SZ8gCJrk4DrWXkNjtfvKAUo/l1ma8eBYE=",
        version = "v0.150.0",
    )
    go_repository(
        name = "org_golang_google_appengine",
        build_external = "vendored",
        importpath = "google.golang.org/appengine",
        sum = "h1:FZR1q0exgwxzPzp/aF+VccGrSfxfPpkBqjIIEq3ru6c=",
        version = "v1.6.7",
    )
    go_repository(
        name = "org_golang_google_genproto",
        build_external = "vendored",
        importpath = "google.golang.org/genproto",
        sum = "h1:+YaDE2r2OG8t/z5qmsh7Y+XXwCbvadxxZ0YY6mTdrVA=",
        version = "v0.0.0-20231016165738-49dd2c1f3d0b",
    )
    go_repository(
        name = "org_golang_google_genproto_googleapis_api",
        build_external = "vendored",
        importpath = "google.golang.org/genproto/googleapis/api",
        sum = "h1:CIC2YMXmIhYw6evmhPxBKJ4fmLbOFtXQN/GV3XOZR8k=",
        version = "v0.0.0-20231016165738-49dd2c1f3d0b",
    )
    go_repository(
        name = "org_golang_google_genproto_googleapis_bytestream",
        build_external = "vendored",
        importpath = "google.golang.org/genproto/googleapis/bytestream",
        sum = "h1:o4S3HvTUEXgRsNSUQsALDVog0O9F/U1JJlHmmUN8Uas=",
        version = "v0.0.0-20231030173426-d783a09b4405",
    )
    go_repository(
        name = "org_golang_google_genproto_googleapis_rpc",
        build_external = "vendored",
        importpath = "google.golang.org/genproto/googleapis/rpc",
        sum = "h1:AB/lmRny7e2pLhFEYIbl5qkDAUt2h0ZRO4wGPhZf+ik=",
        version = "v0.0.0-20231030173426-d783a09b4405",
    )
    go_repository(
        name = "org_golang_google_grpc",
        build_external = "vendored",
        importpath = "google.golang.org/grpc",
        sum = "h1:Z5Iec2pjwb+LEOqzpB2MR12/eKFhDPhuqW91O+4bwUk=",
        version = "v1.59.0",
    )
    go_repository(
        name = "org_golang_google_protobuf",
        build_external = "vendored",
        importpath = "google.golang.org/protobuf",
        sum = "h1:g0LDEJHgrBl9N9r17Ru3sqWhkIx2NB67okBHPwC7hs8=",
        version = "v1.31.0",
    )
    go_repository(
        name = "org_golang_x_crypto",
        build_external = "vendored",
        importpath = "golang.org/x/crypto",
        sum = "h1:wBqGXzWJW6m1XrIKlAH0Hs1JJ7+9KBwnIO8v66Q9cHc=",
        version = "v0.14.0",
    )
    go_repository(
        name = "org_golang_x_exp",
        build_external = "vendored",
        importpath = "golang.org/x/exp",
        sum = "h1:c2HOrn5iMezYjSlGPncknSEr/8x5LELb/ilJbXi9DEA=",
        version = "v0.0.0-20190121172915-509febef88a4",
    )
    go_repository(
        name = "org_golang_x_lint",
        build_external = "vendored",
        importpath = "golang.org/x/lint",
        sum = "h1:XQyxROzUlZH+WIQwySDgnISgOivlhjIEwaQaJEJrrN0=",
        version = "v0.0.0-20190313153728-d0100b6bd8b3",
    )
    go_repository(
        name = "org_golang_x_mod",
        build_external = "vendored",
        importpath = "golang.org/x/mod",
        sum = "h1:LUYupSeNrTNCGzR/hVBk2NHZO4hXcVaW1k4Qx7rjPx8=",
        version = "v0.8.0",
    )
    go_repository(
        name = "org_golang_x_net",
        build_external = "vendored",
        importpath = "golang.org/x/net",
        sum = "h1:pVaXccu2ozPjCXewfr1S7xza/zcXTity9cCdXQYSjIM=",
        version = "v0.17.0",
    )
    go_repository(
        name = "org_golang_x_oauth2",
        build_external = "vendored",
        importpath = "golang.org/x/oauth2",
        sum = "h1:jDDenyj+WgFtmV3zYVoi8aE2BwtXFLWOA67ZfNWftiY=",
        version = "v0.13.0",
    )
    go_repository(
        name = "org_golang_x_sync",
        build_external = "vendored",
        importpath = "golang.org/x/sync",
        sum = "h1:60k92dhOjHxJkrqnwsfl8KuaHbn/5dl0lUPUklKo3qE=",
        version = "v0.5.0",
    )
    go_repository(
        name = "org_golang_x_sys",
        build_external = "vendored",
        importpath = "golang.org/x/sys",
        sum = "h1:Af8nKPmuFypiUBjVoU9V20FiaFXOcuZI21p0ycVYYGE=",
        version = "v0.13.0",
    )
    go_repository(
        name = "org_golang_x_term",
        build_external = "vendored",
        importpath = "golang.org/x/term",
        sum = "h1:bb+I9cTfFazGW51MZqBVmZy7+JEJMouUHTUSKVQLBek=",
        version = "v0.13.0",
    )
    go_repository(
        name = "org_golang_x_text",
        build_external = "vendored",
        importpath = "golang.org/x/text",
        sum = "h1:ablQoSUd0tRdKxZewP80B+BaqeKJuVhuRxj/dkrun3k=",
        version = "v0.13.0",
    )
    go_repository(
        name = "org_golang_x_time",
        build_external = "vendored",
        importpath = "golang.org/x/time",
        sum = "h1:rg5rLMjNzMS1RkNLzCG38eapWhnYLFYXDXj2gOlr8j4=",
        version = "v0.3.0",
    )
    go_repository(
        name = "org_golang_x_tools",
        build_external = "vendored",
        importpath = "golang.org/x/tools",
        sum = "h1:BOw41kyTf3PuCW1pVQf8+Cyg8pMlkYB1oo9iJ6D/lKM=",
        version = "v0.6.0",
    )
    go_repository(
        name = "org_golang_x_xerrors",
        build_external = "vendored",
        importpath = "golang.org/x/xerrors",
        sum = "h1:H2TDz8ibqkAF6YGhCdN3jS9O0/s90v0rJh3X/OLHEUk=",
        version = "v0.0.0-20220907171357-04be3eba64a2",
    )
