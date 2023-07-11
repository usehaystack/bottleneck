build:
	docker rmi haystack_bottleneck || TRUE
	docker build . --tag haystack_bottleneck
run:
	docker run -i -v $(pwd):/app --rm --name haystack_bottleneck_builder haystack_bottleneck