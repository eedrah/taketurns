compile:
	vulcanize --inline -o external/vulcanized.html elements/taketurns-app.html

run:
	python -m SimpleHTTPServer

all: compile run
